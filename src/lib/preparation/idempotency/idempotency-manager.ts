/**
 * Idempotency Manager for Data Preparation Pipeline
 * Ensures duplicate requests with same Idempotency-Key return same result
 */

import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export interface IdempotencyRecord {
  id: string;
  idempotencyKey: string;
  requestHash: string;
  jobId: string;
  response: unknown;
  createdAt: Date;
  expiresAt: Date;
}

export class IdempotencyManager {
  private readonly defaultTTLHours = 24;

  /**
   * Generate hash of request body for additional validation
   */
  private hashRequest(body: unknown): string {
    const content = JSON.stringify(body);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if idempotency key exists and return cached response
   */
  async checkIdempotency(
    idempotencyKey: string,
    datasetId: string,
    tenantId: string,
    requestBody: unknown
  ): Promise<{ jobId: string; response: unknown } | null> {
    const requestHash = this.hashRequest(requestBody);

    // Find existing record
    const existing = await prisma.idempotencyRecord.findFirst({
      where: {
        idempotencyKey,
        datasetId,
        tenantId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!existing) {
      return null;
    }

    // Validate request hash matches
    if (existing.requestHash !== requestHash) {
      throw new Error(
        'Idempotency key conflict: same key used for different request body'
      );
    }

    return {
      jobId: existing.jobId,
      response: existing.response as unknown,
    };
  }

  /**
   * Store idempotency record
   */
  async storeIdempotency(
    idempotencyKey: string,
    datasetId: string,
    tenantId: string,
    requestBody: unknown,
    jobId: string,
    response: unknown,
    ttlHours?: number
  ): Promise<void> {
    const requestHash = this.hashRequest(requestBody);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (ttlHours || this.defaultTTLHours));

    await prisma.idempotencyRecord.create({
      data: {
        idempotencyKey,
        datasetId,
        tenantId,
        requestHash,
        jobId,
        response: response as any,
        expiresAt,
      },
    });
  }

  /**
   * Clean up expired idempotency records
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.idempotencyRecord.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Delete idempotency record (for testing or manual cleanup)
   */
  async deleteIdempotency(idempotencyKey: string): Promise<void> {
    await prisma.idempotencyRecord.deleteMany({
      where: {
        idempotencyKey,
      },
    });
  }

  /**
   * Get idempotency record details
   */
  async getIdempotencyRecord(
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const record = await prisma.idempotencyRecord.findFirst({
      where: {
        idempotencyKey,
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      jobId: record.jobId,
      response: record.response,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }
}

/**
 * Singleton instance
 */
export const idempotencyManager = new IdempotencyManager();
