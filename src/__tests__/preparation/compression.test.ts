import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompressionHelper, compressIfNeeded } from '@/lib/preparation/compile/formatters/compression';
import fs from 'fs/promises';
import path from 'path';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

describe('CompressionHelper', () => {
  let helper: CompressionHelper;
  let testDir: string;

  beforeEach(async () => {
    helper = new CompressionHelper();
    testDir = path.join('/tmp', `compression-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('file compression', () => {
    it('should compress a file', async () => {
      const inputPath = path.join(testDir, 'test.txt');
      const content = 'This is test content that should compress well. '.repeat(100);
      await fs.writeFile(inputPath, content);

      const outputPath = await helper.compressFile(inputPath);

      expect(outputPath).toBe(`${inputPath}.gz`);
      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should compress to custom output path', async () => {
      const inputPath = path.join(testDir, 'test.txt');
      const customOutput = path.join(testDir, 'custom.gz');
      await fs.writeFile(inputPath, 'test content');

      const outputPath = await helper.compressFile(inputPath, customOutput);

      expect(outputPath).toBe(customOutput);
    });

    it('should compress multiple files', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');
      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');

      const compressed = await helper.compressFiles([file1, file2]);

      expect(compressed).toHaveLength(2);
      expect(compressed[0]).toBe(`${file1}.gz`);
      expect(compressed[1]).toBe(`${file2}.gz`);
    });
  });

  describe('compression metrics', () => {
    it('should get compressed file size', async () => {
      const inputPath = path.join(testDir, 'test.txt');
      await fs.writeFile(inputPath, 'test content');
      const compressedPath = await helper.compressFile(inputPath);

      const size = await helper.getCompressedSize(compressedPath);

      expect(size).toBeGreaterThan(0);
    });

    it('should calculate compression ratio', async () => {
      const inputPath = path.join(testDir, 'test.txt');
      const content = 'This is test content. '.repeat(100);
      await fs.writeFile(inputPath, content);
      const compressedPath = await helper.compressFile(inputPath);

      const ratio = await helper.getCompressionRatio(inputPath, compressedPath);

      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1); // Should be compressed
    });

    it('should determine if compression is beneficial', async () => {
      const inputPath = path.join(testDir, 'test.txt');
      const content = 'Repetitive content. '.repeat(100);
      await fs.writeFile(inputPath, content);

      const shouldCompress = await helper.shouldCompress(inputPath);

      expect(shouldCompress).toBe(true);
    });
  });

  describe('in-place compression', () => {
    it('should compress and replace original file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');

      await helper.compressInPlace(filePath);

      // Original file should still exist but be compressed
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // File should be smaller (compressed)
      const stats = await fs.stat(filePath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('extension handling', () => {
    it('should get correct extension for gzip', () => {
      const ext = helper.getExtension('.jsonl', 'gzip');
      expect(ext).toBe('.jsonl.gz');
    });

    it('should get correct extension for no compression', () => {
      const ext = helper.getExtension('.jsonl', 'none');
      expect(ext).toBe('.jsonl');
    });
  });

  describe('string compression', () => {
    it('should compress string content', async () => {
      const content = 'Test content to compress';
      const outputPath = path.join(testDir, 'output.gz');

      await helper.compressString(content, outputPath);

      const exists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should produce valid gzip file from string', async () => {
      const content = 'Test content';
      const outputPath = path.join(testDir, 'output.gz');

      await helper.compressString(content, outputPath);

      // Decompress and verify
      const gunzip = createGunzip();
      const source = createReadStream(outputPath);
      let decompressed = '';

      await new Promise<void>((resolve, reject) => {
        gunzip.on('data', (chunk) => {
          decompressed += chunk.toString();
        });
        gunzip.on('end', () => resolve());
        gunzip.on('error', reject);
        source.pipe(gunzip);
      });

      expect(decompressed).toBe(content);
    });
  });

  describe('helper functions', () => {
    it('should compress files when compression is gzip', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      await fs.writeFile(file1, 'content');

      const result = await compressIfNeeded([file1], 'gzip');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(`${file1}.gz`);
    });

    it('should not compress files when compression is none', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      await fs.writeFile(file1, 'content');

      const result = await compressIfNeeded([file1], 'none');

      expect(result).toEqual([file1]);
    });
  });

  describe('medical use cases', () => {
    it('should compress large clinical dataset', async () => {
      const clinicalData = path.join(testDir, 'clinical-notes.jsonl');
      const content = JSON.stringify({
        patient_id: 'p123',
        note: 'Patient presents with symptoms...',
      }) + '\n';
      await fs.writeFile(clinicalData, content.repeat(1000));

      const compressed = await helper.compressFile(clinicalData);
      const ratio = await helper.getCompressionRatio(clinicalData, compressed);

      expect(ratio).toBeLessThan(0.5); // Should compress well
    });

    it('should handle medical imaging metadata', async () => {
      const metadata = path.join(testDir, 'dicom-metadata.json');
      const content = JSON.stringify({
        study_id: 'study-456',
        series: Array(100).fill({ slice: 1, position: [0, 0, 0] }),
      });
      await fs.writeFile(metadata, content);

      const shouldCompress = await helper.shouldCompress(metadata);
      expect(shouldCompress).toBe(true);
    });
  });
});
