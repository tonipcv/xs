import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Packager } from '@/lib/preparation/deliver/packager';
import { PreparationRequest, CompilationResult } from '@/lib/preparation/preparation.types';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

describe('Packager', () => {
  let packager: Packager;
  let testOutputDir: string;

  const mockRequest: PreparationRequest = {
    leaseId: 'lease_test123',
    version: '1.0',
    task: 'pre-training',
    modality: 'text',
    target: {
      runtime: 'hf',
      format: 'jsonl',
    },
    config: {
      deduplicate: true,
      quality_threshold: 0.8,
      shard_size_mb: 100,
    },
    license: {
      type: 'CC-BY-4.0',
      attribution: 'Test Corp',
    },
    privacy: {
      piiHandling: 'mask',
      patientTokenization: 'hmac-sha256',
      retentionHours: 72,
      auditLogRequired: true,
    },
    output: {
      layout: 'prepared/{datasetId}/{jobId}',
      manifestFile: 'manifest.json',
      readmeFile: 'README.md',
      checksumFile: 'checksums.txt',
      checksumAlgorithm: 'sha256',
    },
  };

  const mockCompilation: CompilationResult = {
    format: 'jsonl',
    shardCount: 2,
    totalSizeBytes: 2048,
    recordCount: 100,
    outputPaths: [],
  };

  beforeEach(async () => {
    packager = new Packager();
    testOutputDir = path.join('/tmp', 'test-packager-' + Date.now());
    await fs.mkdir(testOutputDir, { recursive: true });

    // Create mock shard files
    const shard0Path = path.join(testOutputDir, 'shard-000.jsonl');
    const shard1Path = path.join(testOutputDir, 'shard-001.jsonl');
    await fs.writeFile(shard0Path, '{"text":"test1"}\n{"text":"test2"}\n');
    await fs.writeFile(shard1Path, '{"text":"test3"}\n{"text":"test4"}\n');

    mockCompilation.outputPaths = [shard0Path, shard1Path];
  });

  afterEach(async () => {
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should create manifest with all PreparationSpec fields', async () => {
    const result = await packager.package('ds_test', 'job_test', mockCompilation, mockRequest);

    const manifestContent = await fs.readFile(result.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.version).toBe('1.0');
    expect(manifest.task).toBe('pre-training');
    expect(manifest.modality).toBe('text');
    expect(manifest.target.runtime).toBe('hf');
    expect(manifest.target.format).toBe('jsonl');
    expect(manifest.config.deduplicate).toBe(true);
    expect(manifest.config.quality_threshold).toBe(0.8);
    expect(manifest.license.type).toBe('CC-BY-4.0');
    expect(manifest.license.attribution).toBe('Test Corp');
    expect(manifest.privacy.piiHandling).toBe('mask');
    expect(manifest.privacy.patientTokenization).toBe('hmac-sha256');
    expect(manifest.output.layout).toBe('prepared/{datasetId}/{jobId}');
    expect(manifest.compilation.format).toBe('jsonl');
    expect(manifest.compilation.shardCount).toBe(2);
    expect(manifest.compilation.recordCount).toBe(100);
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files).toContain('shard-000.jsonl');
    expect(manifest.files).toContain('shard-001.jsonl');
  });

  it('should respect custom output layout pattern', async () => {
    const customRequest = {
      ...mockRequest,
      output: {
        ...mockRequest.output,
        layout: 'custom/{datasetId}/jobs/{jobId}',
      },
    };

    const result = await packager.package('ds_abc', 'job_xyz', mockCompilation, customRequest);

    expect(result.baseDir).toContain('custom/ds_abc/jobs/job_xyz');
  });

  it('should use custom filenames from output contract', async () => {
    const customRequest = {
      ...mockRequest,
      output: {
        layout: 'prepared/{datasetId}/{jobId}',
        manifestFile: 'metadata.json',
        readmeFile: 'INSTRUCTIONS.md',
        checksumFile: 'hashes.txt',
        checksumAlgorithm: 'sha256' as const,
      },
    };

    const result = await packager.package('ds_test', 'job_test', mockCompilation, customRequest);

    expect(result.manifestPath).toContain('metadata.json');
    expect(result.readmePath).toContain('INSTRUCTIONS.md');
    expect(result.checksumPath).toContain('hashes.txt');

    const manifestExists = await fs.access(result.manifestPath).then(() => true).catch(() => false);
    const readmeExists = await fs.access(result.readmePath).then(() => true).catch(() => false);
    const checksumExists = await fs.access(result.checksumPath).then(() => true).catch(() => false);

    expect(manifestExists).toBe(true);
    expect(readmeExists).toBe(true);
    expect(checksumExists).toBe(true);
  });

  it('should generate valid SHA256 checksums', async () => {
    const result = await packager.package('ds_test', 'job_test', mockCompilation, mockRequest);

    const checksumContent = await fs.readFile(result.checksumPath, 'utf-8');
    const lines = checksumContent.trim().split('\n');

    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const [hash, filename] = line.split(/\s+/);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(['shard-000.jsonl', 'shard-001.jsonl']).toContain(filename);

      // Verify checksum is correct
      const filePath = mockCompilation.outputPaths.find(p => p.endsWith(filename));
      if (filePath) {
        const content = await fs.readFile(filePath);
        const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
        expect(hash).toBe(expectedHash);
      }
    }
  });

  it('should generate README with license and privacy info', async () => {
    const result = await packager.package('ds_test', 'job_test', mockCompilation, mockRequest);

    const readmeContent = await fs.readFile(result.readmePath, 'utf-8');

    expect(readmeContent).toContain('# Dataset Preparation Output');
    expect(readmeContent).toContain('**Task**: pre-training');
    expect(readmeContent).toContain('**Modality**: text');
    expect(readmeContent).toContain('**Target Runtime**: hf');
    expect(readmeContent).toContain('**Format**: jsonl');
    expect(readmeContent).toContain('**License**: CC-BY-4.0');
    expect(readmeContent).toContain('**PII Handling**: mask');
    expect(readmeContent).toContain('**Shards**: 2');
    expect(readmeContent).toContain('**Records**: 100');
    expect(readmeContent).toContain('shard-000.jsonl');
    expect(readmeContent).toContain('shard-001.jsonl');
    expect(readmeContent).toContain('sha256sum -c checksums.txt');
  });

  it('should create all files in correct directory structure', async () => {
    const result = await packager.package('ds_abc', 'job_xyz', mockCompilation, mockRequest);

    expect(result.baseDir).toContain('prepared/ds_abc/job_xyz');
    expect(result.manifestPath).toContain('prepared/ds_abc/job_xyz/manifest.json');
    expect(result.readmePath).toContain('prepared/ds_abc/job_xyz/README.md');
    expect(result.checksumPath).toContain('prepared/ds_abc/job_xyz/checksums.txt');

    const manifestExists = await fs.access(result.manifestPath).then(() => true).catch(() => false);
    const readmeExists = await fs.access(result.readmePath).then(() => true).catch(() => false);
    const checksumExists = await fs.access(result.checksumPath).then(() => true).catch(() => false);

    expect(manifestExists).toBe(true);
    expect(readmeExists).toBe(true);
    expect(checksumExists).toBe(true);
  });

  it('should handle empty config gracefully', async () => {
    const minimalRequest: PreparationRequest = {
      ...mockRequest,
      config: undefined,
    };

    const result = await packager.package('ds_test', 'job_test', mockCompilation, minimalRequest);

    const manifestContent = await fs.readFile(result.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.config).toEqual({});
  });

  it('should include createdAt timestamp in manifest', async () => {
    const beforeTime = new Date();
    const result = await packager.package('ds_test', 'job_test', mockCompilation, mockRequest);
    const afterTime = new Date();

    const manifestContent = await fs.readFile(result.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.createdAt).toBeDefined();
    const createdAt = new Date(manifest.createdAt);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(createdAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });
});
