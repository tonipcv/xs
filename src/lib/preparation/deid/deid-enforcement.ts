/**
 * De-identification Enforcement Middleware
 * Blocks raw data delivery and ensures de-id is applied
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

export interface DeidEnforcementConfig {
  requireDeidForPurpose: string[];
  blockedRoutes: string[];
  killSwitchEnabled: boolean;
  auditAllAccess: boolean;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  requiresDeid: boolean;
  killSwitchActive?: boolean;
}

export class DeidEnforcement {
  private config: DeidEnforcementConfig;
  private auditLogger: AuditLogger;
  private killSwitchActive: boolean = false;
  private revokedLeases: Set<string> = new Set();

  constructor(config: Partial<DeidEnforcementConfig>, auditLogger: AuditLogger) {
    this.config = {
      requireDeidForPurpose: ['research', 'training', 'third_party'],
      blockedRoutes: ['/api/raw/', '/download/raw/'],
      killSwitchEnabled: true,
      auditAllAccess: true,
      ...config,
    };
    this.auditLogger = auditLogger;
  }

  /**
   * Check if access should be blocked (kill switch or policy violation)
   */
  async checkAccess(
    leaseId: string,
    purpose: string,
    isRaw: boolean
  ): Promise<AccessCheckResult> {
    // Check kill switch first
    if (this.killSwitchActive && this.config.killSwitchEnabled) {
      return {
        allowed: false,
        reason: 'Access revoked by kill switch - immediate revocation active',
        requiresDeid: true,
        killSwitchActive: true,
      };
    }

    // Check if lease was individually revoked
    if (this.revokedLeases.has(leaseId)) {
      return {
        allowed: false,
        reason: 'Lease has been revoked',
        requiresDeid: true,
      };
    }

    // Check if purpose requires de-id
    const requiresDeid = this.config.requireDeidForPurpose.includes(purpose);

    if (isRaw && requiresDeid) {
      await this.auditLogger.log(
        'system',
        'default',
        'preparation.data.access',
        'raw_data_blocked',
        leaseId,
        {
          purpose,
          metadata: {
            reason: 'Raw data access blocked for purpose requiring de-id',
            blockedAt: new Date().toISOString(),
          },
        }
      );

      return {
        allowed: false,
        reason: `Raw data access blocked for purpose: ${purpose}. De-identified data required.`,
        requiresDeid: true,
      };
    }

    return {
      allowed: true,
      requiresDeid,
    };
  }

  /**
   * Middleware to block raw data routes
   */
  middleware(request: NextRequest): NextResponse | null {
    const url = request.nextUrl.pathname;

    // Check if route is blocked
    const isBlocked = this.config.blockedRoutes.some((route) => url.includes(route));

    if (isBlocked) {
      // Log blocked access attempt
      this.auditLogger.log(
        'system',
        'default',
        'preparation.data.access',
        'blocked_route',
        url,
        {
          metadata: {
            path: url,
            method: request.method,
            blockedAt: new Date().toISOString(),
          },
        }
      );

      return NextResponse.json(
        {
          error: 'Access denied',
          message: 'This endpoint delivers raw data and is blocked. Use /prepare endpoint for de-identified data.',
          code: 'RAW_ACCESS_BLOCKED',
        },
        { status: 403 }
      );
    }

    return null; // Continue to next middleware
  }

  /**
   * Activate kill switch - revoke all access immediately
   */
  async activateKillSwitch(reason: string, operatorId: string): Promise<boolean> {
    this.killSwitchActive = true;

    await this.auditLogger.log(
      operatorId,
      'default',
      'preparation.job.cancel',
      'kill_switch',
      'global',
      {
        purpose: 'security',
        metadata: {
          reason,
          operatorId,
          activatedAt: new Date().toISOString(),
          affectedLeases: this.revokedLeases.size,
        },
      }
    );

    return true;
  }

  /**
   * Deactivate kill switch
   */
  async deactivateKillSwitch(operatorId: string): Promise<boolean> {
    this.killSwitchActive = false;

    await this.auditLogger.log(
      operatorId,
      'default',
      'preparation.job.cancel',
      'kill_switch_deactivated',
      'global',
      {
        purpose: 'security',
        metadata: {
          operatorId,
          deactivatedAt: new Date().toISOString(),
        },
      }
    );

    return true;
  }

  /**
   * Revoke a specific lease
   */
  async revokeLease(leaseId: string, reason: string, operatorId: string): Promise<boolean> {
    this.revokedLeases.add(leaseId);

    await this.auditLogger.log(
      operatorId,
      'default',
      'preparation.job.cancel',
      'lease_revoke',
      leaseId,
      {
        purpose: 'security',
        metadata: {
          reason,
          operatorId,
          revokedAt: new Date().toISOString(),
        },
      }
    );

    return true;
  }

  /**
   * Check if lease is revoked
   */
  isLeaseRevoked(leaseId: string): boolean {
    return this.revokedLeases.has(leaseId) || this.killSwitchActive;
  }

  /**
   * Validate that prepared data is de-identified
   */
  validatePreparedData(
    data: unknown,
    purpose: string
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if purpose requires de-id
    if (!this.config.requireDeidForPurpose.includes(purpose)) {
      return { valid: true, issues: [] };
    }

    // Check for PII indicators in data
    const dataStr = JSON.stringify(data);
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b(?:patient|mrn|ssn|dob):\s*\w+/i, // Medical keywords with values
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(dataStr)) {
        issues.push(`Potential PII detected: ${pattern.source}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get enforcement status
   */
  getStatus(): {
    killSwitchActive: boolean;
    revokedLeaseCount: number;
    blockedRouteCount: number;
    requireDeidPurposes: string[];
  } {
    return {
      killSwitchActive: this.killSwitchActive,
      revokedLeaseCount: this.revokedLeases.size,
      blockedRouteCount: this.config.blockedRoutes.length,
      requireDeidPurposes: this.config.requireDeidForPurpose,
    };
  }
}
