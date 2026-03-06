import { describe, it, expect } from 'vitest';
import { AWSSTSManager, STSAssumeRoleConfig, ScopedPermissions } from '@/lib/preparation/deliver/aws-sts-manager';

describe('AWSSTSManager', () => {
  const createManager = () => new AWSSTSManager('us-east-1');

  describe('assume role', () => {
    it('should assume role for dataset access', async () => {
      const manager = createManager();
      const config: STSAssumeRoleConfig = {
        roleArn: 'arn:aws:iam::123456789012:role/test-role',
        sessionName: 'test-session',
        durationSeconds: 900,
      };
      const permissions: ScopedPermissions = {
        bucket: 'test-bucket',
        prefix: 'dataset-123/',
        actions: ['s3:GetObject', 's3:ListBucket'],
      };

      const creds = await manager.assumeRoleForDataset(config, permissions);

      expect(creds.accessKeyId).toMatch(/^ASIA/);
      expect(creds.secretAccessKey).toBeDefined();
      expect(creds.sessionToken).toBeDefined();
      expect(creds.expiration).toBeInstanceOf(Date);
    });

    it('should generate credentials with correct expiration', async () => {
      const manager = createManager();
      const ttlMinutes = 15;

      const creds = await manager.getDatasetAccessCredentials(
        'dataset-123',
        'lease-abc',
        ttlMinutes
      );

      const expectedExpiry = new Date(Date.now() + ttlMinutes * 60000);
      expect(creds.expiration.getTime()).toBeCloseTo(expectedExpiry.getTime(), -2);
    });

    it('should scope permissions to dataset prefix', async () => {
      const manager = createManager();

      const creds = await manager.getDatasetAccessCredentials(
        'dataset-123',
        'lease-abc',
        15
      );

      expect(creds.scope.prefix).toBe('dataset-123/lease-abc/');
      expect(creds.scope.actions).toContain('s3:GetObject');
    });
  });

  describe('streaming credentials', () => {
    it('should get streaming credentials', async () => {
      const manager = createManager();

      const creds = await manager.getStreamingCredentials(
        'ptk_1234567890abcdef',
        ['text', 'image'],
        60
      );

      expect(creds.accessKeyId).toBeDefined();
      expect(creds.scope.bucket).toContain('sidecar');
    });

    it('should have longer TTL for streaming', async () => {
      const manager = createManager();

      const creds = await manager.getStreamingCredentials(
        'ptk_123',
        ['audio'],
        120
      );

      const expectedExpiry = new Date(Date.now() + 120 * 60000);
      expect(creds.expiration.getTime()).toBeCloseTo(expectedExpiry.getTime(), -2);
    });
  });

  describe('credential validation', () => {
    it('should validate active credentials', async () => {
      const manager = createManager();
      const creds = await manager.getDatasetAccessCredentials('ds-1', 'l-1', 15);

      expect(manager.isValid(creds)).toBe(true);
    });

    it('should detect expired credentials', async () => {
      const manager = createManager();
      const creds = {
        accessKeyId: 'ASIA123',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        expiration: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      expect(manager.isValid(creds)).toBe(false);
    });
  });

  describe('credential refresh', () => {
    it('should refresh when near expiry', async () => {
      const manager = createManager();
      const nearExpiryCreds = {
        accessKeyId: 'ASIA123',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        expiration: new Date(Date.now() + 2 * 60000), // 2 minutes left
      };

      let refreshed = false;
      const refreshCallback = async () => {
        refreshed = true;
        return manager.getDatasetAccessCredentials('ds-1', 'l-1', 15);
      };

      await manager.refreshIfNeeded(nearExpiryCreds, refreshCallback, 5);

      expect(refreshed).toBe(true);
    });

    it('should not refresh when not near expiry', async () => {
      const manager = createManager();
      const freshCreds = {
        accessKeyId: 'ASIA123',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        expiration: new Date(Date.now() + 20 * 60000), // 20 minutes left
      };

      let refreshed = false;
      const refreshCallback = async () => {
        refreshed = true;
        return freshCreds;
      };

      const result = await manager.refreshIfNeeded(freshCreds, refreshCallback, 5);

      expect(refreshed).toBe(false);
      expect(result).toBe(freshCreds);
    });
  });

  describe('signed URLs', () => {
    it('should generate signed URL', async () => {
      const manager = createManager();
      const creds = await manager.getDatasetAccessCredentials('ds-1', 'l-1', 15);

      const url = await manager.generateSignedUrl(
        'test-bucket',
        'path/to/file.json',
        creds,
        3600
      );

      expect(url).toContain('test-bucket.s3.amazonaws.com');
      expect(url).toContain('path/to/file.json');
      expect(url).toContain('X-Amz-Signature');
    });
  });
});
