import { prisma } from '@/lib/prisma';
import { createJobLogger } from './job-logger';
import { SignedUrlGenerator } from './deliver/signed-urls';

export type CancellationToken = {
  jobId: string;
  tenantId: string;
  cancelled: boolean;
  cancelledAt?: Date;
  reason?: string;
};

/**
 * KillSwitch - Manages job cancellation and graceful shutdown
 * 
 * Provides:
 * - Cancellation token management per job
 * - Polling mechanism to check for cancellation requests
 * - Graceful shutdown with cleanup
 * - Signed URL revocation on cancellation
 */
export class KillSwitch {
  private activeTokens: Map<string, CancellationToken> = new Map();
  private checkIntervalMs: number;
  private signedUrlGenerator: SignedUrlGenerator;

  constructor(checkIntervalMs: number = 1000) {
    this.checkIntervalMs = checkIntervalMs;
    this.signedUrlGenerator = new SignedUrlGenerator();
  }

  /**
   * Register a job for cancellation tracking
   */
  registerJob(jobId: string, tenantId: string): CancellationToken {
    const token: CancellationToken = {
      jobId,
      tenantId,
      cancelled: false,
    };
    
    this.activeTokens.set(jobId, token);
    return token;
  }

  /**
   * Request cancellation of a job and revoke signed URLs
   */
  async requestCancellation(
    jobId: string, 
    tenantId: string, 
    reason: string = 'User requested cancellation',
    leaseId?: string
  ): Promise<boolean> {
    // Check if job exists and belongs to tenant
    const job = await prisma.preparationJob.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
    });

    if (!job) {
      return false;
    }

    // Can only cancel pending or active jobs
    if (!['pending', 'active', 'processing', 'normalizing', 'compiling', 'delivering'].includes(job.status)) {
      return false;
    }

    // Update job status to cancelled
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        error: `Cancelled: ${reason}`,
        updatedAt: new Date(),
      },
    });

    // Update in-memory token if exists
    const token = this.activeTokens.get(jobId);
    if (token) {
      token.cancelled = true;
      token.cancelledAt = new Date();
      token.reason = reason;
    }

    // Revoke signed URLs if leaseId provided
    if (leaseId) {
      try {
        const revoked = await this.signedUrlGenerator.revokeUrls(leaseId);
        if (revoked) {
          const logger = createJobLogger(jobId, tenantId);
          await logger.info(
            `Signed URLs revoked for lease ${leaseId}`,
            { leaseId },
            'delivery',
            job.progress || 0
          );
        }
      } catch (error) {
        console.error(`Failed to revoke URLs for job ${jobId}:`, error);
      }
    }

    // Log cancellation
    const logger = createJobLogger(jobId, tenantId);
    await logger.warn(
      `Job cancellation requested: ${reason}`,
      { reason, previousStatus: job.status },
      'delivery',
      job.progress || 0
    );

    return true;
  }

  /**
   * Check if a job has been cancelled
   */
  isCancelled(jobId: string): boolean {
    const token = this.activeTokens.get(jobId);
    return token?.cancelled || false;
  }

  /**
   * Get cancellation token for a job
   */
  getToken(jobId: string): CancellationToken | undefined {
    return this.activeTokens.get(jobId);
  }

  /**
   * Poll for cancellation (should be called periodically during job execution)
   */
  async pollCancellation(jobId: string, tenantId: string): Promise<boolean> {
    // First check in-memory token
    const token = this.activeTokens.get(jobId);
    if (token?.cancelled) {
      return true;
    }

    // Poll database for cancellation status
    const job = await prisma.preparationJob.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
      select: {
        status: true,
      },
    });

    if (job?.status === 'cancelled') {
      if (token) {
        token.cancelled = true;
        token.cancelledAt = new Date();
      }
      return true;
    }

    return false;
  }

  /**
   * Unregister a job after completion
   */
  unregisterJob(jobId: string): void {
    this.activeTokens.delete(jobId);
  }

  /**
   * Create an abort controller that checks for cancellation
   */
  createAbortController(jobId: string, tenantId: string): AbortController {
    const controller = new AbortController();
    
    // Set up polling interval
    const intervalId = setInterval(async () => {
      const isCancelled = await this.pollCancellation(jobId, tenantId);
      if (isCancelled) {
        controller.abort('Job cancelled');
        clearInterval(intervalId);
      }
    }, this.checkIntervalMs);

    // Clean up on abort
    controller.signal.addEventListener('abort', () => {
      clearInterval(intervalId);
      this.unregisterJob(jobId);
    });

    return controller;
  }

  /**
   * Get all active cancellation tokens
   */
  getActiveTokens(): CancellationToken[] {
    return Array.from(this.activeTokens.values());
  }

  /**
   * Force kill a job (immediate termination)
   */
  async forceKill(jobId: string, tenantId: string): Promise<boolean> {
    const job = await prisma.preparationJob.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
    });

    if (!job) {
      return false;
    }

    // Mark as failed with kill signal
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: 'Killed: Force termination',
        updatedAt: new Date(),
      },
    });

    // Cancel token
    const token = this.activeTokens.get(jobId);
    if (token) {
      token.cancelled = true;
      token.cancelledAt = new Date();
      token.reason = 'Force kill';
    }

    const logger = createJobLogger(jobId, tenantId);
    await logger.error(
      'Job force killed',
      { method: 'forceKill' },
      'delivery',
      job.progress || 0
    );

    return true;
  }
}

// Singleton instance
let killSwitchInstance: KillSwitch | null = null;

export function getKillSwitch(checkIntervalMs?: number): KillSwitch {
  if (!killSwitchInstance) {
    killSwitchInstance = new KillSwitch(checkIntervalMs);
  }
  return killSwitchInstance;
}

export function resetKillSwitch(): void {
  killSwitchInstance = null;
}
