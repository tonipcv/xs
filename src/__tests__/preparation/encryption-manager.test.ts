import { describe, it, expect } from 'vitest';
import { EncryptionManager, EncryptionConfig } from '@/lib/preparation/security/encryption-manager';

describe('EncryptionManager', () => {
  const createManager = (overrides?: Partial<EncryptionConfig>) => {
    const baseConfig: EncryptionConfig = {
      atRestAlgorithm: 'aws:kms',
      kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      inTransitTLS: true,
      tlsVersion: '1.3',
    };
    return new EncryptionManager({ ...baseConfig, ...overrides });
  };

  describe('S3 encryption config', () => {
    it('should return SSE-KMS config', () => {
      const manager = createManager();
      const config = manager.getS3EncryptionConfig();

      expect(config.serverSideEncryption).toBe('aws:kms');
      expect(config.kmsKeyId).toBeDefined();
      expect(config.bucketKeyEnabled).toBe(true);
    });

    it('should return SSE-S3 config when AES256 selected', () => {
      const manager = createManager({ atRestAlgorithm: 'AES256' });
      const config = manager.getS3EncryptionConfig();

      expect(config.serverSideEncryption).toBe('AES256');
      expect(config.bucketKeyEnabled).toBe(false);
    });
  });

  describe('TLS config', () => {
    it('should return TLS 1.3 config', () => {
      const manager = createManager();
      const config = manager.getTLSConfig();

      expect(config.minVersion).toBe('TLSv1.3');
      expect(config.maxVersion).toBe('TLSv1.3');
      expect(config.hsts).toBe(true);
    });

    it('should include secure cipher suites for TLS 1.3', () => {
      const manager = createManager();
      const config = manager.getTLSConfig();

      expect(config.cipherSuites).toContain('TLS_AES_256_GCM_SHA384');
    });

    it('should support TLS 1.2 when configured', () => {
      const manager = createManager({ tlsVersion: '1.2' });
      const config = manager.getTLSConfig();

      expect(config.minVersion).toBe('TLSv1.2');
    });
  });

  describe('data encryption', () => {
    it('should encrypt data', async () => {
      const manager = createManager();
      const plaintext = Buffer.from('sensitive patient data');

      const encrypted = await manager.encryptData(plaintext, 'key-123');

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.keyId).toBe('key-123');
      expect(encrypted.algorithm).toBe('AES-256-GCM');
    });

    it('should decrypt data', async () => {
      const manager = createManager();
      const plaintext = Buffer.from('sensitive patient data');

      const encrypted = await manager.encryptData(plaintext, 'key-123');
      const decrypted = await manager.decryptData(encrypted);

      expect(decrypted.toString()).toBe(plaintext.toString());
    });
  });

  describe('TLS verification', () => {
    it('should verify valid TLS config', () => {
      const manager = createManager();
      const result = manager.verifyTLSConfig({
        inTransitTLS: true,
        tlsVersion: '1.3',
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect disabled TLS', () => {
      const manager = createManager();
      const result = manager.verifyTLSConfig({
        inTransitTLS: false,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('TLS is not enabled for in-transit encryption');
    });

    it('should detect insecure TLS versions', () => {
      const manager = createManager();
      const result = manager.verifyTLSConfig({
        inTransitTLS: true,
        tlsVersion: '1.0',
      });

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('TLS version'))).toBe(true);
    });
  });

  describe('at-rest verification', () => {
    it('should verify valid at-rest config', () => {
      const manager = createManager();
      const result = manager.verifyAtRestConfig({
        atRestAlgorithm: 'aws:kms',
        kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      });

      expect(result.valid).toBe(true);
    });

    it('should detect missing KMS key ID', () => {
      const manager = createManager();
      const result = manager.verifyAtRestConfig({
        atRestAlgorithm: 'aws:kms',
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('KMS Key ID required when using aws:kms encryption');
    });
  });

  describe('compliance report', () => {
    it('should generate compliance report for KMS', () => {
      const manager = createManager({ atRestAlgorithm: 'aws:kms' });
      const report = manager.generateReport();

      expect(report.atRest.enabled).toBe(true);
      expect(report.atRest.algorithm).toBe('aws:kms');
      expect(report.compliance).toContain('SOC 2');
      expect(report.compliance).toContain('HIPAA');
    });

    it('should include PCI DSS for TLS 1.3', () => {
      const manager = createManager({ tlsVersion: '1.3' });
      const report = manager.generateReport();

      expect(report.inTransit.enabled).toBe(true);
      expect(report.inTransit.tlsVersion).toBe('1.3');
      expect(report.compliance).toContain('PCI DSS');
    });
  });

  describe('key rotation', () => {
    it('should rotate encryption key', async () => {
      const manager = createManager();
      const plaintext = Buffer.from('data to reencrypt');

      const encrypted = await manager.encryptData(plaintext, 'old-key');
      const rotation = await manager.rotateKey(
        'old-key',
        'new-key',
        encrypted.ciphertext
      );

      expect(rotation.rotationSuccessful).toBe(true);
      expect(rotation.newCiphertext).toBeDefined();
    });
  });
});
