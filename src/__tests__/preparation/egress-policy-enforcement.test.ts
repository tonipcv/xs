import { describe, it, expect, vi } from 'vitest';
import {
  EgressPolicyEnforcement,
  EgressPolicy,
  EgressData,
} from '@/lib/preparation/deliver/egress-policy-enforcement';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('EgressPolicyEnforcement', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createEnforcement = () => new EgressPolicyEnforcement(createMockAuditLogger());

  const createSampleData = (): EgressData => ({
    records: [
      { id: 1, name: 'John Doe', ssn: '123-45-6789', age: 30, diagnosis: 'flu' },
      { id: 2, name: 'Jane Smith', ssn: '987-65-4321', age: 25, diagnosis: 'cold' },
      { id: 3, name: 'Bob Wilson', ssn: '555-12-3456', age: 35, diagnosis: 'flu' },
    ],
    metadata: {
      datasetId: 'ds-123',
      jobId: 'job-456',
      totalRecords: 3,
    },
  });

  const createSamplePolicy = (): EgressPolicy => ({
    purpose: 'research',
    tenantId: 'tenant-abc',
    maskingStrategy: 'mask',
    requireAudit: true,
  });

  describe('enforcement', () => {
    it('should apply masking strategy', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy = createSamplePolicy();

      const result = await enforcement.enforce(data, policy);

      expect(result.success).toBe(true);
      expect(result.appliedPolicies).toContain('masking_mask');
      expect(result.transformations.maskedFields).toBeGreaterThan(0);
    });

    it('should filter records based on conditions', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        filterConditions: [
          { field: 'diagnosis', operator: 'eq', value: 'flu' },
        ],
      };

      const result = await enforcement.enforce(data, policy);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2); // Only flu records
      expect(result.transformations.filteredRecords).toBe(1);
    });

    it('should apply field whitelist', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        allowedFields: ['id', 'age'],
      };

      const result = await enforcement.enforce(data, policy);

      expect(result.success).toBe(true);
      expect(result.records[0]).toHaveProperty('id');
      expect(result.records[0]).toHaveProperty('age');
      expect(result.records[0]).not.toHaveProperty('name');
      expect(result.records[0]).not.toHaveProperty('ssn');
    });

    it('should apply field blacklist', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        blockedFields: ['ssn'],
      };

      const result = await enforcement.enforce(data, policy);

      expect(result.success).toBe(true);
      expect(result.records[0]).not.toHaveProperty('ssn');
      expect(result.records[0]).toHaveProperty('name');
    });

    it('should apply multiple policies', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        filterConditions: [{ field: 'age', operator: 'gt', value: 25 }],
        blockedFields: ['ssn'],
      };

      const result = await enforcement.enforce(data, policy);

      expect(result.appliedPolicies).toContain('filter');
      expect(result.appliedPolicies).toContain('field_restriction');
      expect(result.appliedPolicies).toContain('masking_mask');
    });

    it('should skip masking when strategy is none', async () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        maskingStrategy: 'none',
      };

      const result = await enforcement.enforce(data, policy);

      expect(result.appliedPolicies).not.toContain('masking_none');
      expect(result.transformations.maskedFields).toBe(0);
    });

    it('should audit egress', async () => {
      const auditLogger = createMockAuditLogger();
      const enforcement = new EgressPolicyEnforcement(auditLogger);
      const data = createSampleData();
      const policy = createSamplePolicy();

      await enforcement.enforce(data, policy);

      expect(auditLogger.log).toHaveBeenCalledWith(
        'system',
        'tenant-abc',
        'preparation.data.download',
        'egress_enforced',
        'ds-123',
        expect.objectContaining({
          purpose: 'research',
          metadata: expect.objectContaining({
            maskingStrategy: 'mask',
            recordsOutput: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('validation', () => {
    it('should detect blocked fields', () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        blockedFields: ['ssn'],
      };

      const result = enforcement.validate(data, policy);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Blocked field 'ssn' found in record");
    });

    it('should detect unmasked PII', () => {
      const enforcement = createEnforcement();
      const data = createSampleData();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        maskingStrategy: 'mask',
      };

      const result = enforcement.validate(data, policy);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('SSN'))).toBe(true);
    });

    it('should pass validation when no violations', () => {
      const enforcement = createEnforcement();
      const data: EgressData = {
        records: [
          { id: 1, age: 30 },
          { id: 2, age: 25 },
        ],
        metadata: {
          datasetId: 'ds-123',
          jobId: 'job-456',
          totalRecords: 2,
        },
      };
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        maskingStrategy: 'none',
      };

      const result = enforcement.validate(data, policy);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('policy summary', () => {
    it('should summarize whitelist policy', () => {
      const enforcement = createEnforcement();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        allowedFields: ['id', 'name', 'age'],
      };

      const summary = enforcement.getPolicySummary(policy);

      expect(summary.fieldRestrictions).toContain('whitelist');
      expect(summary.fieldRestrictions).toContain('3');
    });

    it('should summarize blacklist policy', () => {
      const enforcement = createEnforcement();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        blockedFields: ['ssn', 'address'],
      };

      const summary = enforcement.getPolicySummary(policy);

      expect(summary.fieldRestrictions).toContain('blacklist');
      expect(summary.fieldRestrictions).toContain('2');
    });

    it('should count filters', () => {
      const enforcement = createEnforcement();
      const policy: EgressPolicy = {
        ...createSamplePolicy(),
        filterConditions: [
          { field: 'age', operator: 'gt', value: 18 },
          { field: 'status', operator: 'eq', value: 'active' },
        ],
      };

      const summary = enforcement.getPolicySummary(policy);

      expect(summary.filters).toBe(2);
    });
  });
});
