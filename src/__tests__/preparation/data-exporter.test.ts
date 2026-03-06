import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExporter, ExportConfig } from '@/lib/preparation/formats/data-exporter';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('DataExporter', () => {
  const exporter = new DataExporter();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('JSONL export', () => {
    it('should export data to JSONL format', async () => {
      const data = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ];
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'output.jsonl'),
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.outputPath).toBe(config.outputPath);
      expect(result.checksum).toBeDefined();
    });

    it('should track progress during export', async () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'output.jsonl'),
        batchSize: 10,
      };
      const progressFn = vi.fn();

      await exporter.export(data, config, progressFn);

      expect(progressFn).toHaveBeenCalled();
      const lastCall = progressFn.mock.calls[progressFn.mock.calls.length - 1][0];
      expect(lastCall.processed).toBe(100);
      expect(lastCall.percentage).toBe(100);
    });

    it('should handle empty arrays', async () => {
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'output.jsonl'),
      };

      const result = await exporter.export([], config);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(0);
    });
  });

  describe('CSV export', () => {
    it('should export data to CSV format', async () => {
      const data = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ];
      const config: ExportConfig = {
        format: 'csv',
        outputPath: path.join(tempDir, 'output.csv'),
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);

      const content = await fs.readFile(config.outputPath, 'utf-8');
      expect(content).toContain('id,name,age');
      expect(content).toContain('1,Alice,30');
    });

    it('should escape CSV special characters', async () => {
      const data = [
        { text: 'Contains, comma' },
        { text: 'Contains "quotes"' },
        { text: 'Contains\nnewline' },
      ];
      const config: ExportConfig = {
        format: 'csv',
        outputPath: path.join(tempDir, 'output.csv'),
      };

      await exporter.export(data, config);

      const content = await fs.readFile(config.outputPath, 'utf-8');
      expect(content).toContain('"Contains, comma"');
    });

    it('should handle missing columns gracefully', async () => {
      const data = [
        { a: 1, b: 2 },
        { a: 3, c: 4 },
      ];
      const config: ExportConfig = {
        format: 'csv',
        outputPath: path.join(tempDir, 'output.csv'),
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(true);
      const content = await fs.readFile(config.outputPath, 'utf-8');
      expect(content).toContain('a,b,c');
    });
  });

  describe('JSON export', () => {
    it('should export data to JSON format', async () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const config: ExportConfig = {
        format: 'json',
        outputPath: path.join(tempDir, 'output.json'),
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(config.outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Alice');
    });
  });

  describe('compression', () => {
    it('should compress output with gzip when requested', async () => {
      const data = [{ id: 1, text: 'test data' }];
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'output.jsonl'),
        compression: 'gzip',
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('.gz');
    });
  });

  describe('error handling', () => {
    it('should handle write errors gracefully', async () => {
      const data = [{ id: 1 }];
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: '/nonexistent/path/output.jsonl',
      };

      const result = await exporter.export(data, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should calculate duration for failed exports', async () => {
      const data = [{ id: 1 }];
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: '/nonexistent/path/output.jsonl',
      };

      const result = await exporter.export(data, config);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('streaming export', () => {
    it('should export from async generator', async () => {
      async function* dataGenerator() {
        for (let i = 0; i < 10; i++) {
          yield { id: i, value: `item-${i}` };
        }
      }

      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'streamed.jsonl'),
      };

      const result = await exporter.streamExport(dataGenerator(), config);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(10);
    });
  });

  describe('medical use cases', () => {
    it('should export clinical records', async () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        patientId: `P${i}`,
        diagnosis: i % 2 === 0 ? 'healthy' : 'condition',
        notes: `Clinical notes for patient ${i}`,
        timestamp: new Date().toISOString(),
      }));

      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'clinical-records.jsonl'),
      };

      const result = await exporter.export(records, config);

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1000);
      expect(result.bytesWritten).toBeGreaterThan(0);
    });

    it('should generate valid checksums for medical data', async () => {
      const data = [{ patientId: 'P12345', phi: 'sensitive data' }];
      const config: ExportConfig = {
        format: 'jsonl',
        outputPath: path.join(tempDir, 'medical.jsonl'),
      };

      const result = await exporter.export(data, config);

      expect(result.checksum).toBeDefined();
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });
  });
});
