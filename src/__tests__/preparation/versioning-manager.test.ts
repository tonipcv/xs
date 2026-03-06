import { describe, it, expect } from 'vitest';
import { VersioningManager, VersionConfig, TTLPolicy } from '@/lib/preparation/versioning/versioning-manager';

describe('VersioningManager', () => {
  const createManager = () => new VersioningManager();

  describe('version generation', () => {
    it('should generate incremental versions', () => {
      const manager = createManager();
      
      const v1 = manager.generateVersion({
        datasetId: 'ds-1',
        config: { task: 'training' },
      });
      const v2 = manager.generateVersion({
        datasetId: 'ds-1',
        config: { task: 'evaluation' },
      });

      expect(v1.version).toBe('v1');
      expect(v2.version).toBe('v2');
    });

    it('should reuse version for identical config', () => {
      const manager = createManager();
      const config = { task: 'training', epochs: 10 };
      
      const v1 = manager.generateVersion({
        datasetId: 'ds-1',
        config,
      });
      const v2 = manager.generateVersion({
        datasetId: 'ds-1',
        config,
      });

      expect(v1.version).toBe(v2.version);
      expect(v1.configHash).toBe(v2.configHash);
    });

    it('should calculate config hash', () => {
      const manager = createManager();
      
      const hash = manager.calculateConfigHash({ task: 'training', epochs: 10 });

      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should track reproducibility with seed', () => {
      const manager = createManager();
      
      const v1 = manager.generateVersion({
        datasetId: 'ds-1',
        config: { task: 'training' },
        seed: 12345,
      });

      expect(v1.isReproducible).toBe(true);
      expect(v1.seed).toBe(12345);
    });

    it('should track commit hash', () => {
      const manager = createManager();
      
      const v1 = manager.generateVersion({
        datasetId: 'ds-1',
        config: { task: 'training' },
        commitHash: 'abc123',
      });

      expect(v1.commitHash).toBe('abc123');
    });
  });

  describe('version history', () => {
    it('should get version history', () => {
      const manager = createManager();
      
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v1' } });
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v2' } });
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v3' } });

      const history = manager.getVersionHistory('ds-1');

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe('v1');
      expect(history[1].version).toBe('v2');
      expect(history[2].version).toBe('v3');
    });

    it('should get specific version', () => {
      const manager = createManager();
      
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v1' } });
      const v2 = manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v2' } });

      const retrieved = manager.getVersion('ds-1', 'v2');

      expect(retrieved?.configHash).toBe(v2.configHash);
    });

    it('should return empty array for unknown dataset', () => {
      const manager = createManager();

      const history = manager.getVersionHistory('unknown');

      expect(history).toHaveLength(0);
    });
  });

  describe('artifact registration', () => {
    it('should register artifacts', () => {
      const manager = createManager();
      
      const artifact = manager.registerArtifact(
        'ds-1',
        '/path/to/artifact.json',
        'v1',
        1024,
        'hash123'
      );

      expect(artifact.path).toBe('/path/to/artifact.json');
      expect(artifact.version).toBe('v1');
      expect(artifact.sizeBytes).toBe(1024);
    });

    it('should track multiple artifacts', () => {
      const manager = createManager();
      
      manager.registerArtifact('ds-1', '/path/1.json', 'v1', 1024, 'hash1');
      manager.registerArtifact('ds-1', '/path/2.json', 'v1', 2048, 'hash2');

      const stats = manager.getStorageStats('ds-1');

      expect(stats.totalArtifacts).toBe(2);
      expect(stats.totalSizeBytes).toBe(3072);
    });
  });

  describe('TTL policy', () => {
    it('should apply TTL and delete old artifacts', () => {
      const manager = createManager();
      
      // Register old artifact
      manager.registerArtifact('ds-1', '/old/path.json', 'v1', 1024, 'hash1');
      
      // Register new artifact
      const newArtifact = manager.registerArtifact('ds-1', '/new/path.json', 'v2', 2048, 'hash2');

      const policy: TTLPolicy = {
        maxVersions: 1,
        ttlDays: 0, // Expire immediately
        keepLatest: false,
      };

      const result = manager.applyTTL('ds-1', policy);

      expect(result.deleted.length).toBeGreaterThan(0);
      expect(result.kept.length).toBe(1);
    });

    it('should keep latest when configured', () => {
      const manager = createManager();
      
      manager.registerArtifact('ds-1', '/path/1.json', 'v1', 1024, 'hash1');
      manager.registerArtifact('ds-1', '/path/2.json', 'v2', 2048, 'hash2');

      const policy: TTLPolicy = {
        maxVersions: 1,
        ttlDays: 0,
        keepLatest: true,
      };

      const result = manager.applyTTL('ds-1', policy);

      expect(result.kept.length).toBe(1);
    });
  });

  describe('reproducibility report', () => {
    it('should track reproducible versions', () => {
      const manager = createManager();
      
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v1' }, seed: 123 });
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v2' } }); // No seed
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v3' }, seed: 456 });

      const report = manager.getReproducibilityReport('ds-1');

      expect(report.totalVersions).toBe(3);
      expect(report.reproducibleVersions).toBe(2);
      expect(report.nonReproducibleVersions).toBe(1);
    });

    it('should track seed usage', () => {
      const manager = createManager();
      
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v1' }, seed: 123 });
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v2' }, seed: 123 }); // Same seed

      const report = manager.getReproducibilityReport('ds-1');

      expect(report.seedUsage['123']).toBe(2);
    });
  });

  describe('storage stats', () => {
    it('should calculate storage stats', () => {
      const manager = createManager();
      
      manager.registerArtifact('ds-1', '/path/1.json', 'v1', 1000, 'hash1');
      manager.registerArtifact('ds-1', '/path/2.json', 'v1', 2000, 'hash2');

      const stats = manager.getStorageStats('ds-1');

      expect(stats.totalArtifacts).toBe(2);
      expect(stats.totalSizeBytes).toBe(3000);
      expect(stats.avgSizeBytes).toBe(1500);
    });

    it('should return empty stats for unknown dataset', () => {
      const manager = createManager();

      const stats = manager.getStorageStats('unknown');

      expect(stats.totalArtifacts).toBe(0);
    });
  });

  describe('manifest export', () => {
    it('should export manifest', () => {
      const manager = createManager();
      
      manager.generateVersion({ datasetId: 'ds-1', config: { task: 'v1' } });
      manager.registerArtifact('ds-1', '/path/1.json', 'v1', 1024, 'hash1');

      const manifest = manager.exportManifest('ds-1');

      expect(manifest.datasetId).toBe('ds-1');
      expect(manifest.versions).toHaveLength(1);
      expect(manifest.artifacts).toHaveLength(1);
      expect(manifest.exportedAt).toBeDefined();
    });
  });
});
