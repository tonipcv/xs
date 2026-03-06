import { describe, it, expect, vi } from 'vitest';
import { SecretRotationManager } from '@/lib/preparation/security/secret-rotation-manager';
import { AuditLogger } from '@/lib/preparation/audit/audit-logger';

describe('SecretRotationManager', () => {
  const createMockAuditLogger = (): AuditLogger =>
    ({ log: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditLogger;

  const createManager = (
    config?: Partial<ConstructorParameters<typeof SecretRotationManager>[0]>
  ) => {
    return new SecretRotationManager(
      {
        rotationIntervalDays: 90,
        overlapPeriodDays: 30,
        maxVersions: 3,
        ...config,
      },
      createMockAuditLogger()
    );
  };

  describe('initialization', () => {
    it('should initialize with first secret', async () => {
      const manager = createManager();
      const secret = await manager.initialize('secret-key-1');

      expect(secret.version).toBe(1);
      expect(secret.status).toBe('active');
      expect(secret.secret).toBe('secret-key-1');
    });

    it('should set correct expiry date', async () => {
      const manager = createManager({ rotationIntervalDays: 90 });
      const before = new Date();
      const secret = await manager.initialize('secret-key-1');
      const after = new Date();

      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 90);

      expect(secret.expiresAt.getTime()).toBeGreaterThan(before.getTime());
      expect(secret.expiresAt.getTime()).toBeLessThan(after.getTime() + 100 * 24 * 60 * 60 * 1000);
    });
  });

  describe('rotation', () => {
    it('should rotate to new secret', async () => {
      const manager = createManager();
      await manager.initialize('old-secret');

      const result = await manager.rotate('new-secret');

      expect(result.success).toBe(true);
      expect(result.newVersion).toBeDefined();
      expect(result.newVersion!.version).toBe(2);
      expect(result.newVersion!.secret).toBe('new-secret');
    });

    it('should mark old secret as retiring', async () => {
      const manager = createManager({ overlapPeriodDays: 30 });
      await manager.initialize('old-secret');

      await manager.rotate('new-secret');

      const oldSecret = manager.getSecretById(
        Array.from((manager as unknown as { secrets: Map<string, unknown> }).secrets.keys())[0]
      );
      expect(oldSecret!.status).toBe('retiring');
    });

    it('should keep only max versions', async () => {
      const manager = createManager({ maxVersions: 2 });
      await manager.initialize('secret-1');
      await manager.rotate('secret-2');
      await manager.rotate('secret-3');

      const status = manager.getStatus();
      expect(status.totalVersions).toBeLessThanOrEqual(2);
    });

    it('should detect when rotation is needed', async () => {
      const manager = createManager({ rotationIntervalDays: 90, overlapPeriodDays: 30 });
      await manager.initialize('secret-1');

      expect(manager.isRotationNeeded()).toBe(false);

      // Fast forward time by 70 days (within overlap period)
      const active = manager.getActiveSecret();
      active!.expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      expect(manager.isRotationNeeded()).toBe(true);
    });
  });

  describe('secret retrieval', () => {
    it('should get active secret', async () => {
      const manager = createManager();
      await manager.initialize('active-secret');

      const active = manager.getActiveSecret();

      expect(active).toBeDefined();
      expect(active!.secret).toBe('active-secret');
      expect(active!.status).toBe('active');
    });

    it('should get valid secrets including retiring', async () => {
      const manager = createManager();
      await manager.initialize('old-secret');
      await manager.rotate('new-secret');

      const valid = manager.getValidSecrets();

      expect(valid).toHaveLength(2);
      expect(valid.map((s) => s.status)).toContain('active');
      expect(valid.map((s) => s.status)).toContain('retiring');
    });

    it('should not return expired secrets as valid', async () => {
      const manager = createManager();
      await manager.initialize('old-secret');
      await manager.rotate('new-secret');

      // Expire the old secret
      const oldSecret = manager.getValidSecrets().find((s) => s.status === 'retiring');
      oldSecret!.expiresAt = new Date(Date.now() - 1000);

      const valid = manager.getValidSecrets();
      expect(valid).toHaveLength(1);
      expect(valid[0].status).toBe('active');
    });
  });

  describe('emergency operations', () => {
    it('should force expire a secret', async () => {
      const manager = createManager();
      const secret = await manager.initialize('secret-to-expire');

      const result = await manager.forceExpire(
        secret.id,
        'security incident',
        'admin-1'
      );

      expect(result).toBe(true);
      const expired = manager.getSecretById(secret.id);
      expect(expired!.status).toBe('expired');
    });

    it('should fail to expire non-existent secret', async () => {
      const manager = createManager();

      const result = await manager.forceExpire(
        'non-existent-id',
        'security incident',
        'admin-1'
      );

      expect(result).toBe(false);
    });
  });

  describe('status reporting', () => {
    it('should report rotation status', async () => {
      const manager = createManager();
      await manager.initialize('secret-1');
      await manager.rotate('secret-2');

      const status = manager.getStatus();

      expect(status.activeVersion).toBe(2);
      expect(status.retiringVersions).toContain(1);
      expect(status.totalVersions).toBe(2);
      expect(status.nextRotationDue).toBeDefined();
    });

    it('should indicate rotation needed', async () => {
      const manager = createManager({ rotationIntervalDays: 30, overlapPeriodDays: 5 });
      await manager.initialize('secret-1');

      // Set expiry close to now
      const active = manager.getActiveSecret();
      active!.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const status = manager.getStatus();
      expect(status.rotationNeeded).toBe(true);
    });
  });

  describe('token verification', () => {
    it('should verify token with version metadata', () => {
      const manager = createManager();
      const token = Buffer.from(
        JSON.stringify({ version: 1, data: 'test' })
      ).toString('base64');

      const valid = manager.verifyTokenOrigin(`${token}.signature`, [1, 2]);

      expect(valid).toBe(true);
    });

    it('should reject token with wrong version', () => {
      const manager = createManager();
      const token = Buffer.from(
        JSON.stringify({ version: 3, data: 'test' })
      ).toString('base64');

      const valid = manager.verifyTokenOrigin(`${token}.signature`, [1, 2]);

      expect(valid).toBe(false);
    });

    it('should reject malformed token', () => {
      const manager = createManager();
      const valid = manager.verifyTokenOrigin('invalid-token', [1, 2]);

      expect(valid).toBe(false);
    });
  });
});
