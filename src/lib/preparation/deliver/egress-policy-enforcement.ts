/**
 * Policy Enforcement on Egress
 * Applies masking/filtering at data egress time
 * Ensures policy is not just a gate but actively enforces data transformation
 */

import { AuditLogger } from '@/lib/preparation/audit/audit-logger';
import { PIIDeidentifier } from '@/lib/preparation/deid/pii-deidentifier';

export interface EgressPolicy {
  purpose: string;
  tenantId: string;
  maskingStrategy: 'mask' | 'redact' | 'hash' | 'tokenize' | 'none';
  allowedFields?: string[]; // Field whitelist
  blockedFields?: string[]; // Field blacklist
  filterConditions?: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  }>;
  requireAudit: boolean;
}

export interface EgressData {
  records: Array<Record<string, unknown>>;
  metadata: {
    datasetId: string;
    jobId: string;
    totalRecords: number;
  };
}

export interface EnforcementResult {
  success: boolean;
  records: Array<Record<string, unknown>>;
  appliedPolicies: string[];
  transformations: {
    maskedFields: number;
    filteredRecords: number;
    redactedValues: number;
  };
  auditLogId: string;
  error?: string;
}

export class EgressPolicyEnforcement {
  private auditLogger: AuditLogger;
  private deidentifier: PIIDeidentifier;

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
    this.deidentifier = new PIIDeidentifier();
  }

  /**
   * Enforce policy on data egress
   * Applies masking, filtering, and field restrictions
   */
  async enforce(data: EgressData, policy: EgressPolicy): Promise<EnforcementResult> {
    const startTime = Date.now();
    const appliedPolicies: string[] = [];
    let maskedFields = 0;
    let filteredRecords = 0;
    let redactedValues = 0;

    try {
      let processedRecords = [...data.records];

      // Step 1: Filter records based on conditions
      if (policy.filterConditions && policy.filterConditions.length > 0) {
        const beforeCount = processedRecords.length;
        processedRecords = this.applyFilters(processedRecords, policy.filterConditions);
        filteredRecords = beforeCount - processedRecords.length;
        appliedPolicies.push('filter');
      }

      // Step 2: Apply field restrictions (whitelist/blacklist)
      if (policy.allowedFields || policy.blockedFields) {
        processedRecords = this.applyFieldRestrictions(
          processedRecords,
          policy.allowedFields,
          policy.blockedFields
        );
        appliedPolicies.push('field_restriction');
      }

      // Step 3: Apply PII masking/de-identification
      if (policy.maskingStrategy !== 'none') {
        const maskResult = await this.applyMasking(processedRecords, policy.maskingStrategy);
        processedRecords = maskResult.records;
        maskedFields = maskResult.maskedCount;
        redactedValues = maskResult.redactedCount;
        appliedPolicies.push(`masking_${policy.maskingStrategy}`);
      }

      // Step 4: Audit the egress
      const auditLogId = await this.auditEgress(
        data.metadata,
        policy,
        processedRecords.length,
        startTime
      );

      return {
        success: true,
        records: processedRecords,
        appliedPolicies,
        transformations: {
          maskedFields,
          filteredRecords,
          redactedValues,
        },
        auditLogId,
      };
    } catch (error) {
      await this.auditError(data.metadata, policy, error, startTime);
      return {
        success: false,
        records: [],
        appliedPolicies,
        transformations: {
          maskedFields,
          filteredRecords,
          redactedValues,
        },
        auditLogId: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply filter conditions to records
   */
  private applyFilters(
    records: Array<Record<string, unknown>>,
    conditions: EgressPolicy['filterConditions']
  ): Array<Record<string, unknown>> {
    return records.filter((record) => {
      for (const condition of conditions || []) {
        const value = record[condition.field];
        let matches = false;

        switch (condition.operator) {
          case 'eq':
            matches = value === condition.value;
            break;
          case 'neq':
            matches = value !== condition.value;
            break;
          case 'gt':
            matches = typeof value === 'number' && value > (condition.value as number);
            break;
          case 'lt':
            matches = typeof value === 'number' && value < (condition.value as number);
            break;
          case 'contains':
            matches = typeof value === 'string' && value.includes(condition.value as string);
            break;
        }

        if (!matches) return false;
      }
      return true;
    });
  }

  /**
   * Apply field restrictions (whitelist/blacklist)
   */
  private applyFieldRestrictions(
    records: Array<Record<string, unknown>>,
    allowedFields?: string[],
    blockedFields?: string[]
  ): Array<Record<string, unknown>> {
    return records.map((record) => {
      const filtered: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        // Check whitelist
        if (allowedFields && !allowedFields.includes(key)) {
          continue;
        }

        // Check blacklist
        if (blockedFields && blockedFields.includes(key)) {
          continue;
        }

        filtered[key] = value;
      }

      return filtered;
    });
  }

  /**
   * Apply PII masking to records
   */
  private async applyMasking(
    records: Array<Record<string, unknown>>,
    strategy: string
  ): Promise<{ records: Array<Record<string, unknown>>; maskedCount: number; redactedCount: number }> {
    let totalMasked = 0;
    let totalRedacted = 0;

    const processed = records.map((record) => {
      const processedRecord: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
          // Check if field might contain PII
          const result = this.deidentifier.deidentify(value, {
            strategy: strategy as 'mask' | 'redact' | 'hash' | 'tokenize',
          });

          if (result.maskedCount > 0) {
            totalMasked++;
            totalRedacted += result.maskedCount;
            processedRecord[key] = result.text;
          } else {
            processedRecord[key] = value;
          }
        } else {
          processedRecord[key] = value;
        }
      }

      return processedRecord;
    });

    return {
      records: processed,
      maskedCount: totalMasked,
      redactedCount: totalRedacted,
    };
  }

  /**
   * Audit data egress
   */
  private async auditEgress(
    metadata: EgressData['metadata'],
    policy: EgressPolicy,
    recordsCount: number,
    startTime: number
  ): Promise<string> {
    await this.auditLogger.log(
      'system',
      policy.tenantId,
      'preparation.data.download',
      'egress_enforced',
      metadata.datasetId,
      {
        purpose: policy.purpose,
        metadata: {
          jobId: metadata.jobId,
          maskingStrategy: policy.maskingStrategy,
          allowedFields: policy.allowedFields,
          blockedFields: policy.blockedFields,
          filterConditions: policy.filterConditions,
          recordsOutput: recordsCount,
          duration: Date.now() - startTime,
        },
      }
    );

    return `audit-${Date.now()}`;
  }

  /**
   * Audit errors
   */
  private async auditError(
    metadata: EgressData['metadata'],
    policy: EgressPolicy,
    error: unknown,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.log(
      'system',
      policy.tenantId,
      'preparation.data.download',
      'egress_error',
      metadata.datasetId,
      {
        purpose: policy.purpose,
        metadata: {
          jobId: metadata.jobId,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        },
      }
    );
  }

  /**
   * Validate data against policy without transforming
   */
  validate(data: EgressData, policy: EgressPolicy): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Check for blocked fields
    if (policy.blockedFields) {
      for (const record of data.records) {
        for (const field of policy.blockedFields) {
          if (field in record) {
            violations.push(`Blocked field '${field}' found in record`);
          }
        }
      }
    }

    // Check for required masking
    if (policy.maskingStrategy !== 'none') {
      for (const record of data.records) {
        const recordStr = JSON.stringify(record);
        // Check for potential PII patterns
        if (/\b\d{3}-\d{2}-\d{4}\b/.test(recordStr)) {
          violations.push('Unmasked SSN pattern detected');
        }
        if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(recordStr)) {
          violations.push('Unmasked email pattern detected');
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Get policy summary for display
   */
  getPolicySummary(policy: EgressPolicy): {
    purpose: string;
    masking: string;
    fieldRestrictions: string;
    filters: number;
  } {
    let restrictions = 'none';
    if (policy.allowedFields && policy.blockedFields) {
      restrictions = `whitelist (${policy.allowedFields.length}) + blacklist (${policy.blockedFields.length})`;
    } else if (policy.allowedFields) {
      restrictions = `whitelist (${policy.allowedFields.length})`;
    } else if (policy.blockedFields) {
      restrictions = `blacklist (${policy.blockedFields.length})`;
    }

    return {
      purpose: policy.purpose,
      masking: policy.maskingStrategy,
      fieldRestrictions: restrictions,
      filters: policy.filterConditions?.length || 0,
    };
  }
}
