import { describe, it, expect, vi } from 'vitest';
import {
  RawDataBypassPrevention,
  BypassPreventionConfig,
} from '@/lib/preparation/deid/raw-bypass-prevention';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';
import { DeidEnforcement } from '@/lib/preparation/deid/deid-enforcement';

describe('RawDataBypassPrevention', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createMockDeidEnforcement = () => ({
    checkAccess: vi.fn().mockResolvedValue({ allowed: true, requiresDeid: true }),
  } as unknown as DeidEnforcement);

  const createPrevention = (config?: Partial<BypassPreventionConfig>) => {
    return new RawDataBypassPrevention(
      config || {},
      createMockAuditLogger(),
      createMockDeidEnforcement()
    );
  };

  describe('bypass detection', () => {
    it('should detect raw data endpoint', async () => {
      const prevention = createPrevention();
      const data = { name: 'John', ssn: '123-45-6789' };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/raw/dataset/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain("Raw endpoint '/api/raw/dataset/123' blocked for purpose 'research'");
      expect(result.autoBlocked).toBe(true);
    });

    it('should detect PII in data', async () => {
      const prevention = createPrevention();
      const data = {
        patients: [
          { name: 'John Doe', ssn: '123-45-6789', email: 'john@example.com' },
        ],
      };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.violations.some((v) => v.includes('SSN'))).toBe(true);
      expect(result.violations.some((v) => v.includes('Email'))).toBe(true);
    });

    it('should allow de-identified data', async () => {
      const prevention = createPrevention();
      const data = {
        patients: [
          { id: 'ptk_abc123', age: 30, diagnosis: 'flu', _deid_applied: true },
        ],
      };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow internal purpose without strict checks', async () => {
      const prevention = createPrevention();
      const data = { name: 'John', ssn: '123-45-6789' };

      const result = await prevention.checkForBypass(
        data,
        'internal', // Not in requireDeidForPurposes
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should block raw endpoint access', async () => {
      const prevention = createPrevention();
      const request = {
        url: '/api/raw/dataset/123',
        method: 'GET',
        headers: {},
      };
      const response = {
        status: vi.fn(),
        json: vi.fn(),
      };

      const result = await prevention.middleware(request, response);

      expect(result).toBe(false);
      expect(response.status).toHaveBeenCalledWith(403);
    });

    it('should allow non-raw endpoints', async () => {
      const prevention = createPrevention();
      const request = {
        url: '/api/v1/datasets/123',
        method: 'GET',
        headers: {},
      };
      const response = {
        status: vi.fn(),
        json: vi.fn(),
      };

      const result = await prevention.middleware(request, response);

      expect(result).toBe(true);
    });
  });

  describe('pre-flight validation', () => {
    it('should validate before egress', async () => {
      const prevention = createPrevention();
      const data = { patients: [{ name: 'John', ssn: '123-45-6789' }] };

      const result = await prevention.validateBeforeEgress(
        data,
        'research',
        'lease-abc'
      );

      expect(result.canProceed).toBe(false);
      expect(result.issues).toContain('Raw data detected - de-identification required');
    });

    it('should allow de-identified data to proceed', async () => {
      const prevention = createPrevention();
      const data = { patients: [{ id: 'ptk_abc123', age: 30 }] };

      const result = await prevention.validateBeforeEgress(
        data,
        'research',
        'lease-abc'
      );

      expect(result.valid).toBe(true);
      expect(result.canProceed).toBe(true);
    });
  });

  describe('emergency block', () => {
    it('should activate emergency block', async () => {
      const auditLogger = createMockAuditLogger();
      const prevention = new RawDataBypassPrevention(
        {},
        auditLogger,
        createMockDeidEnforcement()
      );

      await prevention.emergencyBlock('security incident', 'admin-123');

      expect(auditLogger.log).toHaveBeenCalledWith(
        'admin-123',
        'default',
        'preparation.job.cancel',
        'emergency_raw_block',
        'global',
        expect.objectContaining({
          purpose: 'security',
          metadata: expect.objectContaining({
            reason: 'security incident',
            operatorId: 'admin-123',
          }),
        })
      );
    });
  });

  describe('status', () => {
    it('should return protection status', () => {
      const prevention = createPrevention({
        strictMode: true,
        autoBlock: true,
      });

      const status = prevention.getStatus();

      expect(status.strictMode).toBe(true);
      expect(status.autoBlock).toBe(true);
      expect(status.protectedPurposes).toContain('research');
      expect(status.protectedEndpoints).toContain('/api/raw/');
    });
  });

  describe('data classification', () => {
    it('should classify data with PII as raw', async () => {
      const prevention = createPrevention();
      const data = { ssn: '123-45-6789', email: 'test@example.com' };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should classify masked data as de-identified', async () => {
      const prevention = createPrevention();
      const data = { ssn: '[REDACTED]', name: '***' };

      const result = await prevention.checkForBypass(
        data,
        'research',
        '/api/v1/datasets/123',
        'lease-abc'
      );

      expect(result.allowed).toBe(true);
    });
  });
});
