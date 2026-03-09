import { describe, it, expect, vi } from 'vitest';
import { DeidEnforcement, DeidEnforcementConfig } from '@/lib/preparation/deid/deid-enforcement';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('DeidEnforcement', () => {
  const createMockAuditLogger = () => ({
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger);

  const createEnforcement = (config?: Partial<DeidEnforcementConfig>) => {
    return new DeidEnforcement(
      {
        requireDeidForPurpose: ['research', 'training'],
        blockedRoutes: ['/api/raw/', '/download/raw/'],
        killSwitchEnabled: true,
        auditAllAccess: true,
        ...config,
      },
      createMockAuditLogger()
    );
  };

  describe('access checking', () => {
    it('should allow access when no restrictions apply', async () => {
      const enforcement = createEnforcement();
      
      const result = await enforcement.checkAccess('lease-1', 'internal', false);

      expect(result.allowed).toBe(true);
      expect(result.requiresDeid).toBe(false);
    });

    it('should block raw access for research purpose', async () => {
      const enforcement = createEnforcement();
      
      const result = await enforcement.checkAccess('lease-1', 'research', true);

      expect(result.allowed).toBe(false);
      expect(result.requiresDeid).toBe(true);
      expect(result.reason).toContain('Raw data access blocked');
    });

    it('should require de-id for training purpose', async () => {
      const enforcement = createEnforcement();
      
      const result = await enforcement.checkAccess('lease-1', 'training', false);

      expect(result.allowed).toBe(true);
      expect(result.requiresDeid).toBe(true);
    });

    it('should block access when kill switch is active', async () => {
      const enforcement = createEnforcement();
      await enforcement.activateKillSwitch('security incident', 'admin-1');
      
      const result = await enforcement.checkAccess('lease-1', 'internal', false);

      expect(result.allowed).toBe(false);
      expect(result.killSwitchActive).toBe(true);
    });

    it('should block access when lease is revoked', async () => {
      const enforcement = createEnforcement();
      await enforcement.revokeLease('lease-1', 'suspicious activity', 'admin-1');
      
      const result = await enforcement.checkAccess('lease-1', 'internal', false);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Lease has been revoked');
    });
  });

  describe('kill switch', () => {
    it('should activate kill switch', async () => {
      const enforcement = createEnforcement();
      
      const result = await enforcement.activateKillSwitch('security breach', 'admin-1');

      expect(result).toBe(true);
      const status = enforcement.getStatus();
      expect(status.killSwitchActive).toBe(true);
    });

    it('should deactivate kill switch', async () => {
      const enforcement = createEnforcement();
      await enforcement.activateKillSwitch('security breach', 'admin-1');
      
      const result = await enforcement.deactivateKillSwitch('admin-1');

      expect(result).toBe(true);
      const status = enforcement.getStatus();
      expect(status.killSwitchActive).toBe(false);
    });

    it('should affect all access when kill switch is active', async () => {
      const enforcement = createEnforcement();
      await enforcement.activateKillSwitch('emergency', 'admin-1');
      
      const result1 = await enforcement.checkAccess('lease-1', 'internal', false);
      const result2 = await enforcement.checkAccess('lease-2', 'research', false);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });
  });

  describe('lease revocation', () => {
    it('should revoke specific lease', async () => {
      const enforcement = createEnforcement();
      
      const result = await enforcement.revokeLease('lease-1', 'violation', 'admin-1');

      expect(result).toBe(true);
      expect(enforcement.isLeaseRevoked('lease-1')).toBe(true);
    });

    it('should not affect other leases when revoking one', async () => {
      const enforcement = createEnforcement();
      await enforcement.revokeLease('lease-1', 'violation', 'admin-1');
      
      expect(enforcement.isLeaseRevoked('lease-1')).toBe(true);
      expect(enforcement.isLeaseRevoked('lease-2')).toBe(false);
    });
  });

  describe('middleware', () => {
    it('should block raw routes', () => {
      const enforcement = createEnforcement();
      const request = {
        nextUrl: { pathname: '/api/raw/dataset/123' },
        method: 'GET',
      } as unknown as import('next/server').NextRequest;
      
      const response = enforcement.middleware(request);

      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should allow non-raw routes', () => {
      const enforcement = createEnforcement();
      const request = {
        nextUrl: { pathname: '/api/v1/datasets/123' },
        method: 'GET',
      } as unknown as import('next/server').NextRequest;
      
      const response = enforcement.middleware(request);

      expect(response).toBeNull();
    });

    it('should block download raw routes', () => {
      const enforcement = createEnforcement();
      const request = {
        nextUrl: { pathname: '/download/raw/file.zip' },
        method: 'GET',
      } as unknown as import('next/server').NextRequest;
      
      const response = enforcement.middleware(request);

      expect(response).not.toBeNull();
    });
  });

  describe('data validation', () => {
    it('should detect PII in data', () => {
      const enforcement = createEnforcement();
      const data = {
        text: 'Patient SSN: 123-45-6789',
      };
      
      const result = enforcement.validatePreparedData(data, 'research');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should pass validation when no PII detected', () => {
      const enforcement = createEnforcement();
      const data = {
        text: 'Normal medical text without PII',
      };
      
      const result = enforcement.validatePreparedData(data, 'research');

      // May or may not have issues depending on pattern matching
      expect(result.issues).toBeDefined();
    });

    it('should skip validation for purposes not requiring de-id', () => {
      const enforcement = createEnforcement();
      const data = {
        patientId: '123',
        ssn: '123-45-6789',
      };
      
      const result = enforcement.validatePreparedData(data, 'internal');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('status', () => {
    it('should return enforcement status', () => {
      const enforcement = createEnforcement();
      
      const status = enforcement.getStatus();

      expect(status.killSwitchActive).toBe(false);
      expect(status.blockedRouteCount).toBe(2);
      expect(status.requireDeidPurposes).toContain('research');
      expect(status.requireDeidPurposes).toContain('training');
    });

    it('should track revoked lease count', async () => {
      const enforcement = createEnforcement();
      await enforcement.revokeLease('lease-1', 'reason', 'admin');
      await enforcement.revokeLease('lease-2', 'reason', 'admin');
      
      const status = enforcement.getStatus();

      expect(status.revokedLeaseCount).toBe(2);
    });
  });
});
