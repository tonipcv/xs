import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignedUrlGenerator } from '@/lib/preparation/deliver/signed-urls';
import fs from 'fs/promises';
import path from 'path';

describe('SignedUrlGenerator (stub mode)', () => {
  let generator: SignedUrlGenerator;
  let testDir: string;

  beforeEach(async () => {
    // Force stub mode
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    
    generator = new SignedUrlGenerator({ mode: 'stub' });
    testDir = path.join('/tmp', 'test-signed-urls-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('URL revocation', () => {
    it('should revoke URLs for a lease', async () => {
      const file = path.join(testDir, 'file.jsonl');
      await fs.writeFile(file, '{"test":"data"}\n');

      const leaseId = 'lease_revoke_test';
      
      // Generate URLs
      const urls = await generator.generateUrls([file], leaseId);
      expect(urls).toHaveLength(1);
      
      // Check URLs are active
      expect(generator.hasActiveUrls(leaseId)).toBe(true);
      
      // Revoke URLs
      const revoked = await generator.revokeUrls(leaseId);
      expect(revoked).toBe(true);
      
      // Check URLs are no longer active
      expect(generator.hasActiveUrls(leaseId)).toBe(false);
    });

    it('should return true when revoking non-existent lease', async () => {
      const revoked = await generator.revokeUrls('non_existent_lease');
      expect(revoked).toBe(true);
    });

    it('should track multiple leases separately', async () => {
      const file1 = path.join(testDir, 'file1.jsonl');
      const file2 = path.join(testDir, 'file2.jsonl');
      await fs.writeFile(file1, '{"test":"data1"}\n');
      await fs.writeFile(file2, '{"test":"data2"}\n');

      const leaseId1 = 'lease_1';
      const leaseId2 = 'lease_2';
      
      await generator.generateUrls([file1], leaseId1);
      await generator.generateUrls([file2], leaseId2);
      
      expect(generator.hasActiveUrls(leaseId1)).toBe(true);
      expect(generator.hasActiveUrls(leaseId2)).toBe(true);
      
      // Revoke only lease 1
      await generator.revokeUrls(leaseId1);
      
      expect(generator.hasActiveUrls(leaseId1)).toBe(false);
      expect(generator.hasActiveUrls(leaseId2)).toBe(true);
    });

    it('should return active URL info for a lease', async () => {
      const file = path.join(testDir, 'file.jsonl');
      await fs.writeFile(file, '{"test":"data"}\n');

      const leaseId = 'lease_info_test';
      await generator.generateUrls([file], leaseId);
      
      const activeUrls = generator.getActiveUrls(leaseId);
      expect(activeUrls).toHaveLength(1);
      expect(activeUrls[0].url).toBeDefined();
      expect(activeUrls[0].key).toBeDefined();
      expect(activeUrls[0].expiresAt).toBeInstanceOf(Date);
    });

    it('should return empty array for non-existent lease', () => {
      const activeUrls = generator.getActiveUrls('non_existent');
      expect(activeUrls).toEqual([]);
    });
  });
});

describe.skip('SignedUrlGenerator (requires real AWS credentials)', () => {
  let generator: SignedUrlGenerator;
  let testDir: string;

  beforeEach(async () => {
    // Mock AWS credentials for testing
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.AWS_REGION = 'us-east-1';
    
    generator = new SignedUrlGenerator();
    testDir = path.join('/tmp', 'test-signed-urls-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should generate signed URLs for all files', async () => {
    const shard0 = path.join(testDir, 'shard-000.jsonl');
    const shard1 = path.join(testDir, 'shard-001.jsonl');
    const manifest = path.join(testDir, 'manifest.json');

    await fs.writeFile(shard0, '{"text":"test1"}\n');
    await fs.writeFile(shard1, '{"text":"test2"}\n');
    await fs.writeFile(manifest, '{}');

    const filePaths = [shard0, shard1, manifest];
    const leaseId = 'lease_test123';
    const urls = await generator.generateUrls(filePaths, leaseId);

    expect(urls).toHaveLength(3);
    urls.forEach(url => {
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  it('should include lease ID in URL path', async () => {
    const file = path.join(testDir, 'file.jsonl');
    await fs.writeFile(file, '{"test":"data"}\n');

    const leaseId = 'lease_abc123';
    const urls = await generator.generateUrls([file], leaseId);

    expect(urls[0]).toContain(leaseId);
  });

  it('should handle empty file list', async () => {
    const urls = await generator.generateUrls([], 'lease_test');
    expect(urls).toHaveLength(0);
  });

  it('should preserve file extensions in URLs', async () => {
    const jsonl = path.join(testDir, 'data.jsonl');
    const parquet = path.join(testDir, 'data.parquet');
    const json = path.join(testDir, 'manifest.json');

    await fs.writeFile(jsonl, '{"test":"data"}\n');
    await fs.writeFile(parquet, 'mock parquet data');
    await fs.writeFile(json, '{}');

    const urls = await generator.generateUrls([jsonl, parquet, json], 'lease_test');

    expect(urls[0]).toContain('.jsonl');
    expect(urls[1]).toContain('.parquet');
    expect(urls[2]).toContain('.json');
  });

  it('should generate unique URLs for different files', async () => {
    const shard0 = path.join(testDir, 'shard-000.jsonl');
    const shard1 = path.join(testDir, 'shard-001.jsonl');

    await fs.writeFile(shard0, '{"text":"test1"}\n');
    await fs.writeFile(shard1, '{"text":"test2"}\n');

    const urls = await generator.generateUrls([shard0, shard1], 'lease_test');

    expect(urls[0]).not.toBe(urls[1]);
    expect(urls[0]).toContain('shard-000.jsonl');
    expect(urls[1]).toContain('shard-001.jsonl');
  });

  it('should handle files with special characters', async () => {
    const file1 = path.join(testDir, 'file with spaces.jsonl');
    const file2 = path.join(testDir, 'file-with-dashes.jsonl');
    const file3 = path.join(testDir, 'file_with_underscores.jsonl');

    await fs.writeFile(file1, '{"test":"data1"}\n');
    await fs.writeFile(file2, '{"test":"data2"}\n');
    await fs.writeFile(file3, '{"test":"data3"}\n');

    const urls = await generator.generateUrls([file1, file2, file3], 'lease_test');

    expect(urls).toHaveLength(3);
    urls.forEach(url => {
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  it('should use consistent URL format', async () => {
    const file = path.join(testDir, 'file.jsonl');
    await fs.writeFile(file, '{"test":"data"}\n');

    const leaseId = 'lease_test123';
    const urls1 = await generator.generateUrls([file], leaseId);
    const urls2 = await generator.generateUrls([file], leaseId);

    // URLs should be consistent for same inputs
    expect(urls1[0]).toBe(urls2[0]);
  });
});
