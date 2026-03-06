/**
 * Secret Rotation Manager for HMAC Tokens
 * Manages rotation of HMAC secrets used for cross-modal tokenization
 * Implements secure key rotation with backward compatibility
 */

import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

export interface SecretRotationConfig {
  rotationIntervalDays: number;
  overlapPeriodDays: number;
  maxVersions: number;
}

export interface SecretVersion {
  id: string;
  secret: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'retiring' | 'expired';
  version: number;
}

export interface RotationResult {
  success: boolean;
  newVersion?: SecretVersion;
  error?: string;
  auditLogId: string;
}

export class SecretRotationManager {
  private config: SecretRotationConfig;
  private auditLogger: AuditLogger;
  private secrets: Map<string, SecretVersion>;

  constructor(
    config: Partial<SecretRotationConfig>,
    auditLogger: AuditLogger
  ) {
    this.config = {
      rotationIntervalDays: 90,
      overlapPeriodDays: 30,
      maxVersions: 3,
      ...config,
    };
    this.auditLogger = auditLogger;
    this.secrets = new Map();
  }

  /**
   * Initialize with a new secret
   */
  async initialize(initialSecret: string): Promise<SecretVersion> {
    const version: SecretVersion = {
      id: this.generateId(),
      secret: initialSecret,
      createdAt: new Date(),
      expiresAt: this.calculateExpiry(),
      status: 'active',
      version: 1,
    };

    this.secrets.set(version.id, version);

    await this.auditLogger.log(
      'system',
      'default',
      'preparation.job.cancel',
      'secret_initialized',
      version.id,
      {
        purpose: 'security',
        metadata: {
          version: version.version,
          expiresAt: version.expiresAt.toISOString(),
        },
      }
    );

    return version;
  }

  /**
   * Rotate to a new secret
   */
  async rotate(newSecret: string): Promise<RotationResult> {
    try {
      // Get current active secret
      const currentActive = this.getActiveSecret();

      // Mark current as retiring if exists
      if (currentActive) {
        currentActive.status = 'retiring';
        currentActive.expiresAt = new Date(
          Date.now() + this.config.overlapPeriodDays * 24 * 60 * 60 * 1000
        );
      }

      // Create new active secret
      const newVersion: SecretVersion = {
        id: this.generateId(),
        secret: newSecret,
        createdAt: new Date(),
        expiresAt: this.calculateExpiry(),
        status: 'active',
        version: this.getNextVersionNumber(),
      };

      this.secrets.set(newVersion.id, newVersion);

      // Clean up old versions
      this.cleanupOldVersions();

      // Audit the rotation
      const auditLogId = await this.auditRotation(
        currentActive?.id || 'none',
        newVersion.id,
        newVersion.version
      );

      return {
        success: true,
        newVersion,
        auditLogId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Rotation failed';
      const auditLogId = await this.auditRotationFailure(errorMsg);

      return {
        success: false,
        error: errorMsg,
        auditLogId,
      };
    }
  }

  /**
   * Get active secret for tokenization
   */
  getActiveSecret(): SecretVersion | undefined {
    return Array.from(this.secrets.values()).find(
      (s) => s.status === 'active'
    );
  }

  /**
   * Get all valid secrets (active + retiring) for verification
   */
  getValidSecrets(): SecretVersion[] {
    const now = new Date();
    return Array.from(this.secrets.values()).filter(
      (s) => (s.status === 'active' || s.status === 'retiring') && s.expiresAt > now
    );
  }

  /**
   * Get secret by ID for verification
   */
  getSecretById(id: string): SecretVersion | undefined {
    return this.secrets.get(id);
  }

  /**
   * Check if rotation is needed based on configuration
   */
  isRotationNeeded(): boolean {
    const active = this.getActiveSecret();
    if (!active) return true;

    const daysUntilExpiry =
      (active.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    return daysUntilExpiry <= this.config.overlapPeriodDays;
  }

  /**
   * Force expire a secret (emergency use)
   */
  async forceExpire(secretId: string, reason: string, operatorId: string): Promise<boolean> {
    const secret = this.secrets.get(secretId);
    if (!secret) return false;

    secret.status = 'expired';
    secret.expiresAt = new Date();

    await this.auditLogger.log(
      operatorId,
      'default',
      'preparation.job.cancel',
      'secret_force_expired',
      secretId,
      {
        purpose: 'security',
        metadata: {
          reason,
          operatorId,
          previousStatus: secret.status,
          expiredAt: new Date().toISOString(),
        },
      }
    );

    return true;
  }

  /**
   * Get rotation status and history
   */
  getStatus(): {
    activeVersion?: number;
    retiringVersions: number[];
    totalVersions: number;
    nextRotationDue: Date | null;
    rotationNeeded: boolean;
  } {
    const active = this.getActiveSecret();
    const retiring = Array.from(this.secrets.values()).filter(
      (s) => s.status === 'retiring'
    );

    return {
      activeVersion: active?.version,
      retiringVersions: retiring.map((s) => s.version),
      totalVersions: this.secrets.size,
      nextRotationDue: active?.expiresAt || null,
      rotationNeeded: this.isRotationNeeded(),
    };
  }

  /**
   * Verify a token was created with any valid secret
   */
  verifyTokenOrigin(token: string, expectedVersions: number[]): boolean {
    // In production, this would validate the HMAC signature
    // For now, just check version metadata
    const parts = token.split('.');
    if (parts.length < 2) return false;

    try {
      const metadata = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      return expectedVersions.includes(metadata.version);
    } catch {
      return false;
    }
  }

  private generateId(): string {
    return `secret-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateExpiry(): Date {
    return new Date(
      Date.now() + this.config.rotationIntervalDays * 24 * 60 * 60 * 1000
    );
  }

  private getNextVersionNumber(): number {
    const versions = Array.from(this.secrets.values()).map((s) => s.version);
    return Math.max(0, ...versions) + 1;
  }

  private cleanupOldVersions(): void {
    const sorted = Array.from(this.secrets.values()).sort(
      (a, b) => b.version - a.version
    );

    // Keep only maxVersions most recent
    if (sorted.length > this.config.maxVersions) {
      const toRemove = sorted.slice(this.config.maxVersions);
      for (const secret of toRemove) {
        // Remove expired secrets and retiring secrets beyond maxVersions
        if (secret.status === 'expired' || secret.status === 'retiring') {
          this.secrets.delete(secret.id);
        }
      }
    }
  }

  private async auditRotation(
    oldSecretId: string,
    newSecretId: string,
    newVersion: number
  ): Promise<string> {
    const auditLogId = `rotation-${Date.now()}`;

    await this.auditLogger.log(
      'system',
      'default',
      'preparation.job.cancel',
      'secret_rotated',
      newSecretId,
      {
        purpose: 'security',
        metadata: {
          oldSecretId,
          newVersion,
          rotatedAt: new Date().toISOString(),
          intervalDays: this.config.rotationIntervalDays,
          overlapDays: this.config.overlapPeriodDays,
        },
      }
    );

    return auditLogId;
  }

  private async auditRotationFailure(error: string): Promise<string> {
    const auditLogId = `rotation-fail-${Date.now()}`;

    await this.auditLogger.log(
      'system',
      'default',
      'preparation.job.cancel',
      'secret_rotation_failed',
      'unknown',
      {
        purpose: 'security',
        metadata: {
          error,
          failedAt: new Date().toISOString(),
        },
      }
    );

    return auditLogId;
  }
}
