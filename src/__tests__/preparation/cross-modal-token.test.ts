import { describe, it, expect } from 'vitest';
import {
  CrossModalTokenGenerator,
  TokenRegistry,
  TokenConfig,
} from '@/lib/preparation/deid/cross-modal-token';

describe('CrossModalTokenGenerator', () => {
  const createConfig = (overrides?: Partial<TokenConfig>): TokenConfig => ({
    tenantSecret: 'test-secret-12345',
    datasetSalt: 'test-salt-67890',
    version: 1,
    ...overrides,
  });

  describe('token generation', () => {
    it('should generate consistent token for same patient', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const patientId = 'patient-123';

      const token1 = generator.generateToken(patientId);
      const token2 = generator.generateToken(patientId);

      expect(token1.token).toBe(token2.token);
      expect(token1.version).toBe(1);
    });

    it('should generate different tokens for different patients', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      const token1 = generator.generateToken('patient-1');
      const token2 = generator.generateToken('patient-2');

      expect(token1.token).not.toBe(token2.token);
    });

    it('should include all modalities by default', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const token = generator.generateToken('patient-123');

      expect(token.modalities).toContain('text');
      expect(token.modalities).toContain('dicom');
      expect(token.modalities).toContain('audio');
      expect(token.modalities).toContain('claims');
    });

    it('should allow custom modalities', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const token = generator.generateToken('patient-123', ['text', 'dicom']);

      expect(token.modalities).toContain('text');
      expect(token.modalities).toContain('dicom');
      expect(token.modalities).not.toContain('audio');
    });

    it('should use HMAC format (ptk_ prefix)', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const token = generator.generateToken('patient-123');

      expect(token.token).toMatch(/^ptk_[a-f0-9]{16}$/);
    });
  });

  describe('batch generation', () => {
    it('should generate tokens for multiple patients', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const patients = ['patient-1', 'patient-2', 'patient-3'];

      const results = generator.batchGenerateTokens(patients);

      expect(results.size).toBe(3);
      for (const patient of patients) {
        expect(results.has(patient)).toBe(true);
      }
    });

    it('should maintain consistency in batch', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const patients = ['patient-1', 'patient-2'];

      const batch1 = generator.batchGenerateTokens(patients);
      const batch2 = generator.batchGenerateTokens(patients);

      for (const patient of patients) {
        expect(batch1.get(patient)?.token).toBe(batch2.get(patient)?.token);
      }
    });
  });

  describe('version rotation', () => {
    it('should rotate version with new secret', () => {
      const generator = new CrossModalTokenGenerator(createConfig({ version: 1 }));
      const newGenerator = generator.rotateVersion('new-secret', 'new-salt');

      expect(newGenerator.getStats().version).toBe(2);
    });

    it('should generate different tokens after rotation', () => {
      const generator = new CrossModalTokenGenerator(createConfig({ version: 1 }));
      const token1 = generator.generateToken('patient-123');

      const newGenerator = generator.rotateVersion('new-secret', 'new-salt');
      const token2 = newGenerator.generateToken('patient-123');

      expect(token1.token).not.toBe(token2.token);
      expect(token2.version).toBe(2);
    });
  });

  describe('token verification', () => {
    it('should verify valid token', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const token = generator.generateToken('patient-123');

      expect(generator.verifyToken('patient-123', token.token)).toBe(true);
    });

    it('should reject invalid token', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      expect(generator.verifyToken('patient-123', 'invalid-token')).toBe(false);
    });
  });

  describe('apply to records', () => {
    it('should apply token to single record', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const record = { patientId: 'patient-123', data: 'test' };

      const result = generator.applyTokenToRecord(record, ['text', 'dicom']);

      expect(result.patientToken).toBeDefined();
      expect(result.tokenVersion).toBe(1);
      expect(result.tokenAppliedAt).toBeInstanceOf(Date);
      expect(result.data).toBe('test'); // original data preserved
    });

    it('should apply tokens to batch of records', () => {
      const generator = new CrossModalTokenGenerator(createConfig());
      const records = [
        { patientId: 'patient-1', text: 'record 1' },
        { patientId: 'patient-2', text: 'record 2' },
        { patientId: 'patient-1', text: 'record 3' }, // Same patient
      ];

      const results = generator.batchApplyTokens(records, ['text']);

      expect(results).toHaveLength(3);
      // Same patient should get same token
      expect(results[0].patientToken).toBe(results[2].patientToken);
      // Different patient should get different token
      expect(results[0].patientToken).not.toBe(results[1].patientToken);
    });
  });

  describe('link tokens', () => {
    it('should generate consistent link tokens', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      const link1 = generator.generateLinkToken('patient-123', 'text', 'dicom');
      const link2 = generator.generateLinkToken('patient-123', 'text', 'dicom');

      expect(link1).toBe(link2);
      expect(link1).toMatch(/^lnk_[a-f0-9]{12}$/);
    });

    it('should generate different link tokens for different modalities', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      const link1 = generator.generateLinkToken('patient-123', 'text', 'dicom');
      const link2 = generator.generateLinkToken('patient-123', 'text', 'audio');

      expect(link1).not.toBe(link2);
    });
  });

  describe('caching', () => {
    it('should cache tokens', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      generator.generateToken('patient-1');
      generator.generateToken('patient-2');
      generator.generateToken('patient-1'); // Should hit cache

      expect(generator.getStats().cacheSize).toBe(2);
    });

    it('should clear cache', () => {
      const generator = new CrossModalTokenGenerator(createConfig());

      generator.generateToken('patient-1');
      generator.generateToken('patient-2');

      expect(generator.getStats().cacheSize).toBe(2);

      generator.clearCache();

      expect(generator.getStats().cacheSize).toBe(0);
    });
  });

  describe('static factory methods', () => {
    it('should generate random salt', () => {
      const salt1 = CrossModalTokenGenerator.generateSalt();
      const salt2 = CrossModalTokenGenerator.generateSalt();

      expect(salt1).toMatch(/^[a-f0-9]{32}$/);
      expect(salt1).not.toBe(salt2);
    });

    it('should create generator from config', () => {
      const generator = CrossModalTokenGenerator.fromConfig({
        tenantSecret: 'secret',
        datasetId: 'dataset-123',
        version: 2,
      });

      expect(generator.getStats().version).toBe(2);
      expect(generator.getStats().saltLength).toBe(16);
    });

    it('should derive salt from dataset ID', () => {
      const gen1 = CrossModalTokenGenerator.fromConfig({
        tenantSecret: 'secret',
        datasetId: 'dataset-123',
      });
      const gen2 = CrossModalTokenGenerator.fromConfig({
        tenantSecret: 'secret',
        datasetId: 'dataset-123',
      });

      // Same dataset ID should produce same salt
      const token1 = gen1.generateToken('patient-1');
      const token2 = gen2.generateToken('patient-1');
      expect(token1.token).toBe(token2.token);
    });
  });

  describe('stats', () => {
    it('should return stats', () => {
      const generator = new CrossModalTokenGenerator(createConfig({
        rotationDate: new Date(),
      }));

      generator.generateToken('patient-1');
      generator.generateToken('patient-2');

      const stats = generator.getStats();

      expect(stats.version).toBe(1);
      expect(stats.cacheSize).toBe(2);
      expect(stats.hasRotationDate).toBe(true);
    });
  });
});

describe('TokenRegistry', () => {
  it('should register and lookup tokens', () => {
    const registry = new TokenRegistry();

    registry.register('patient-123', 'ptk_abc123', 1, 'salt1');

    const metadata = registry.lookup('patient-123');

    expect(metadata).toBeDefined();
    expect(metadata?.token).toBe('ptk_abc123');
    expect(metadata?.version).toBe(1);
  });

  it('should reverse lookup by token', () => {
    const registry = new TokenRegistry();

    registry.register('patient-123', 'ptk_abc123', 1, 'salt1');

    const metadata = registry.reverseLookup('ptk_abc123');

    expect(metadata?.originalId).toBe('patient-123');
  });

  it('should export registry', () => {
    const registry = new TokenRegistry();

    registry.register('patient-1', 'ptk_abc', 1, 'salt1');
    registry.register('patient-2', 'ptk_def', 1, 'salt2');

    const exported = registry.exportRegistry();

    expect(exported.version).toBe('1.0');
    expect(exported.tokens).toHaveLength(2);
  });
});
