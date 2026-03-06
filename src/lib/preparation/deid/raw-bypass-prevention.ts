/**
 * Raw Data Bypass Prevention
 * Ensures no raw data bypasses de-identification on delivery
 * Implements strict checks at egress points
 */

import { AuditLogger } from '@/lib/preparation/audit/audit-logger';
import { DeidEnforcement } from '@/lib/preparation/deid/deid-enforcement';

export interface BypassPreventionConfig {
  requireDeidForPurposes: string[];
  rawEndpoints: string[];
  strictMode: boolean;
  autoBlock: boolean;
}

export interface DataClassification {
  isRaw: boolean;
  isDeidentified: boolean;
  confidence: number;
  detectedPII: string[];
}

export interface BypassCheckResult {
  allowed: boolean;
  reason?: string;
  violations: string[];
  autoBlocked: boolean;
  auditLogId: string;
}

export class RawDataBypassPrevention {
  private config: BypassPreventionConfig;
  private auditLogger: AuditLogger;
  private deidEnforcement: DeidEnforcement;

  constructor(
    config: Partial<BypassPreventionConfig>,
    auditLogger: AuditLogger,
    deidEnforcement: DeidEnforcement
  ) {
    this.config = {
      requireDeidForPurposes: ['research', 'training', 'third_party', 'external'],
      rawEndpoints: ['/api/raw/', '/download/raw/', '/export/unfiltered/'],
      strictMode: true,
      autoBlock: true,
      ...config,
    };
    this.auditLogger = auditLogger;
    this.deidEnforcement = deidEnforcement;
  }

  /**
   * Check if data delivery would bypass de-id requirements
   */
  async checkForBypass(
    data: unknown,
    purpose: string,
    endpoint: string,
    leaseId: string
  ): Promise<BypassCheckResult> {
    const violations: string[] = [];
    let autoBlocked = false;

    // Check 1: Is this a purpose that requires de-id?
    const requiresDeid = this.config.requireDeidForPurposes.includes(purpose);

    // Check 2: Is this a raw data endpoint?
    const isRawEndpoint = this.config.rawEndpoints.some((ep) =>
      endpoint.includes(ep)
    );

    if (isRawEndpoint && requiresDeid) {
      violations.push(`Raw endpoint '${endpoint}' blocked for purpose '${purpose}'`);
      if (this.config.autoBlock) {
        autoBlocked = true;
      }
    }

    // Check 3: Classify data for PII content
    const classification = this.classifyData(data);

    if (classification.isRaw && requiresDeid) {
      violations.push(`Raw data detected (confidence: ${classification.confidence.toFixed(2)})`);
      violations.push(...classification.detectedPII.map((pii) => `PII detected: ${pii}`));
      
      if (this.config.autoBlock && this.config.strictMode) {
        autoBlocked = true;
      }
    }

    // Check 4: Verify de-id was actually applied
    if (requiresDeid && !classification.isDeidentified) {
      violations.push('Data is not marked as de-identified');
      if (this.config.strictMode) {
        autoBlocked = true;
      }
    }

    // Audit the check
    const auditLogId = await this.auditBypassCheck(
      leaseId,
      purpose,
      endpoint,
      violations,
      autoBlocked
    );

    return {
      allowed: violations.length === 0 || !autoBlocked,
      reason: autoBlocked
        ? 'Auto-blocked: Raw data would bypass de-id requirements'
        : undefined,
      violations,
      autoBlocked,
      auditLogId,
    };
  }

  /**
   * Classify data as raw or de-identified
   */
  private classifyData(data: unknown): DataClassification {
    const dataStr = JSON.stringify(data);
    const detectedPII: string[] = [];
    let piiScore = 0;

    // Check for SSN patterns
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(dataStr)) {
      detectedPII.push('SSN pattern');
      piiScore += 0.3;
    }

    // Check for email patterns
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(dataStr)) {
      detectedPII.push('Email pattern');
      piiScore += 0.2;
    }

    // Check for phone patterns
    if (/\b\d{3}-\d{3}-\d{4}\b/.test(dataStr)) {
      detectedPII.push('Phone pattern');
      piiScore += 0.2;
    }

    // Check for medical record numbers
    if (/\b(?:MRN|Medical Record):?\s*\d{6,}\b/i.test(dataStr)) {
      detectedPII.push('Medical record number');
      piiScore += 0.3;
    }

    // Check for de-identification markers
    const hasDeidMarkers =
      /\[REDACTED\]/i.test(dataStr) ||
      /\[MASKED\]/i.test(dataStr) ||
      /\*+/.test(dataStr) ||
      /ptk_[a-f0-9]{16}/.test(dataStr); // Patient token pattern

    // Check for explicit de-id metadata
    const hasDeidMetadata =
      dataStr.includes('"deidentified": true') ||
      dataStr.includes('"_deid_applied": true');

    const isRaw = piiScore > 0.5 || (detectedPII.length >= 2 && !hasDeidMarkers);
    const isDeidentified = hasDeidMarkers || hasDeidMetadata || piiScore < 0.1;

    return {
      isRaw,
      isDeidentified,
      confidence: Math.min(piiScore, 1),
      detectedPII,
    };
  }

  /**
   * Validate prepared data before egress
   */
  async validateBeforeEgress(
    data: unknown,
    purpose: string,
    leaseId: string
  ): Promise<{
    valid: boolean;
    canProceed: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check de-id enforcement
    const enforcementCheck = await this.deidEnforcement.checkAccess(
      leaseId,
      purpose,
      false
    );

    if (!enforcementCheck.allowed) {
      issues.push(enforcementCheck.reason || 'Access denied by de-id enforcement');
      return { valid: false, canProceed: false, issues };
    }

    // Validate data classification
    const classification = this.classifyData(data);

    if (classification.isRaw && enforcementCheck.requiresDeid) {
      issues.push('Raw data detected - de-identification required');
      issues.push(...classification.detectedPII);

      if (this.config.strictMode) {
        return { valid: false, canProceed: false, issues };
      }
    }

    return {
      valid: issues.length === 0,
      canProceed: true,
      issues,
    };
  }

  /**
   * Middleware for raw data detection
   */
  async middleware(
    request: { url: string; method: string; headers: Record<string, string> },
    response: { status: (code: number) => void; json: (data: unknown) => void }
  ): Promise<boolean> {
    const url = request.url;

    // Check if this is a raw data endpoint
    const isRawEndpoint = this.config.rawEndpoints.some((ep) => url.includes(ep));

    if (isRawEndpoint) {
      // Block immediately
      response.status(403);
      response.json({
        error: 'Access denied',
        message: 'This endpoint delivers raw data. Use /prepare endpoint for de-identified data.',
        code: 'RAW_DATA_BLOCKED',
      });

      // Audit the blocked attempt
      await this.auditLogger.log(
        'system',
        'default',
        'preparation.data.access',
        'raw_bypass_blocked',
        url,
        {
          metadata: {
            path: url,
            method: request.method,
            blockedAt: new Date().toISOString(),
            reason: 'Raw data endpoint access attempt',
          },
        }
      );

      return false; // Stop processing
    }

    return true; // Continue processing
  }

  /**
   * Audit bypass check
   */
  private async auditBypassCheck(
    leaseId: string,
    purpose: string,
    endpoint: string,
    violations: string[],
    autoBlocked: boolean
  ): Promise<string> {
    const auditLogId = `bypass-check-${Date.now()}`;

    await this.auditLogger.log(
      'system',
      'default',
      'preparation.data.access',
      autoBlocked ? 'raw_bypass_blocked' : 'raw_bypass_check',
      leaseId,
      {
        purpose,
        metadata: {
          endpoint,
          violations,
          autoBlocked,
          strictMode: this.config.strictMode,
          checkedAt: new Date().toISOString(),
        },
      }
    );

    return auditLogId;
  }

  /**
   * Get prevention status
   */
  getStatus(): {
    strictMode: boolean;
    autoBlock: boolean;
    protectedPurposes: string[];
    protectedEndpoints: string[];
  } {
    return {
      strictMode: this.config.strictMode,
      autoBlock: this.config.autoBlock,
      protectedPurposes: this.config.requireDeidForPurposes,
      protectedEndpoints: this.config.rawEndpoints,
    };
  }

  /**
   * Emergency block - immediately block all raw data egress
   */
  async emergencyBlock(reason: string, operatorId: string): Promise<void> {
    // Temporarily add all endpoints to raw list
    this.config.rawEndpoints.push('/api/v1/', '/download/');

    await this.auditLogger.log(
      operatorId,
      'default',
      'preparation.job.cancel',
      'emergency_raw_block',
      'global',
      {
        purpose: 'security',
        metadata: {
          reason,
          operatorId,
          activatedAt: new Date().toISOString(),
        },
      }
    );
  }
}
