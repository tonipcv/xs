import { describe, it, expect, vi } from 'vitest';
import { SidecarDelivery, SidecarConfig } from '@/lib/preparation/deliver/sidecar-delivery';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('SidecarDelivery', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createDelivery = () => new SidecarDelivery(createMockAuditLogger());

  const createConfig = (): SidecarConfig => ({
    patientToken: 'ptk_1234567890abcdef',
    modalities: ['text', 'image'],
    purpose: 'research',
    leaseId: 'lease_abc123',
    expirationMinutes: 60,
    deidentify: true,
    policies: {
      allowDownload: true,
      allowStreaming: false,
      watermark: true,
      auditAccess: true,
    },
  });

  describe('delivery', () => {
    it('should deliver package with access URL', async () => {
      const delivery = createDelivery();
      const config = createConfig();

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.success).toBe(true);
      expect(result.package).toBeDefined();
      expect(result.package?.accessUrl).toBeDefined();
      expect(result.package?.patientToken).toBe(config.patientToken);
    });

    it('should include download URL when allowed', async () => {
      const delivery = createDelivery();
      const config = createConfig();

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.package?.downloadUrl).toBeDefined();
    });

    it('should not include streaming URL when not allowed', async () => {
      const delivery = createDelivery();
      const config = createConfig();
      config.policies.allowStreaming = false;

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.package?.streamingUrl).toBeUndefined();
    });

    it('should apply watermark when required', async () => {
      const delivery = createDelivery();
      const config = createConfig();

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.package?.watermarkId).toBeDefined();
      expect(result.package?.watermarkId).toMatch(/^wm-/);
    });

    it('should prepare segments for all modalities', async () => {
      const delivery = createDelivery();
      const config = createConfig();

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].type).toBe('text');
      expect(result.segments[1].type).toBe('image');
    });

    it('should audit the delivery', async () => {
      const auditLogger = createMockAuditLogger();
      const delivery = new SidecarDelivery(auditLogger);
      const config = createConfig();

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.auditLogId).toBeDefined();
      expect(auditLogger.log).toHaveBeenCalled();
    });

    it('should handle invalid lease', async () => {
      const delivery = createDelivery();
      const config = createConfig();
      config.leaseId = 'invalid_lease';

      const result = await delivery.deliver('/path/to/prepared', config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid lease');
    });
  });

  describe('revocation', () => {
    it('should revoke access', async () => {
      const delivery = createDelivery();

      const result = await delivery.revokeAccess(
        'lease_abc123',
        'ptk_1234567890abcdef',
        'security breach'
      );

      expect(result).toBe(true);
    });

    it('should audit revocation', async () => {
      const auditLogger = createMockAuditLogger();
      const delivery = new SidecarDelivery(auditLogger);

      await delivery.revokeAccess('lease_abc123', 'ptk_123', 'reason');

      expect(auditLogger.log).toHaveBeenCalledWith(
        'system',
        'default',
        'preparation.job.cancel',
        'prepared_dataset',
        'ptk_123',
        expect.objectContaining({
          purpose: 'security',
        })
      );
    });
  });

  describe('access validation', () => {
    it('should validate access token', async () => {
      const delivery = createDelivery();

      const result = await delivery.validateAccess('ptk_123', 'token_xyz');

      expect(result.valid).toBe(true);
      expect(result.segments).toContain('text');
    });

    it('should return expiration status', async () => {
      const delivery = createDelivery();

      const result = await delivery.validateAccess('ptk_123', 'token_xyz');

      expect(result.expired).toBe(false);
    });
  });

  describe('policies', () => {
    it('should enforce de-identification', async () => {
      const delivery = createDelivery();
      const config = createConfig();
      config.deidentify = true;

      const result = await delivery.deliver('/path/to/prepared', config);

      for (const segment of result.segments) {
        expect(segment.policyEnforced).toBe(true);
      }
    });

    it('should not enforce when deidentify is false', async () => {
      const delivery = createDelivery();
      const config = createConfig();
      config.deidentify = false;

      const result = await delivery.deliver('/path/to/prepared', config);

      for (const segment of result.segments) {
        expect(segment.policyEnforced).toBe(false);
      }
    });
  });

  describe('expiration', () => {
    it('should set expiration time', async () => {
      const delivery = createDelivery();
      const config = createConfig();
      config.expirationMinutes = 60;

      const result = await delivery.deliver('/path/to/prepared', config);

      const expectedExpiry = new Date(Date.now() + 60 * 60000);
      expect(result.package?.expiresAt.getTime()).toBeCloseTo(
        expectedExpiry.getTime(),
        -2 // Allow 100ms difference
      );
    });
  });
});
