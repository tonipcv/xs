import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamingJsonlWriter, arrayToAsyncGenerator } from '@/lib/preparation/compile/formatters/streaming-jsonl-writer';
import fs from 'fs/promises';
import path from 'path';

describe('StreamingJsonlWriter', () => {
  let writer: StreamingJsonlWriter;
  let testDir: string;

  beforeEach(async () => {
    writer = new StreamingJsonlWriter();
    testDir = path.join('/tmp', `streaming-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await writer.close();
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('basic operations', () => {
    it('should write single record', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      await writer.writeRecord({ id: 1, text: 'test' });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('{"id":1,"text":"test"}\n');
    });

    it('should write multiple records', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      await writer.writeRecord({ id: 1 });
      await writer.writeRecord({ id: 2 });
      await writer.writeRecord({ id: 3 });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should track record count', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      await writer.writeRecord({ id: 1 });
      await writer.writeRecord({ id: 2 });
      
      expect(writer.getRecordCount()).toBe(2);
      await writer.close();
    });
  });

  describe('array writing', () => {
    it('should write array of records', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      const records = [
        { id: 1, text: 'first' },
        { id: 2, text: 'second' },
        { id: 3, text: 'third' },
      ];

      const count = await writer.writeArray(records);
      await writer.close();

      expect(count).toBe(3);

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should handle large arrays with batching', async () => {
      const filePath = path.join(testDir, 'large.jsonl');
      await writer.open(filePath);
      
      const records = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
      const count = await writer.writeArray(records, 1000);
      await writer.close();

      expect(count).toBe(10000);
    });
  });

  describe('async iterable', () => {
    it('should write from async generator', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const generator = arrayToAsyncGenerator(records);

      const count = await writer.writeRecords(generator);
      await writer.close();

      expect(count).toBe(3);
    });

    it('should write from generator function', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      async function* generate() {
        for (let i = 0; i < 5; i++) {
          yield { id: i };
        }
      }

      const count = await writer.writeFromGenerator(generate);
      await writer.close();

      expect(count).toBe(5);
    });
  });

  describe('transformation', () => {
    it('should write with transformation', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await writer.open(filePath);
      
      const records = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const count = await writer.writeWithTransform(records, (record) => ({
        ...record,
        processed: true,
      }));
      await writer.close();

      expect(count).toBe(2);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('"processed":true');
    });
  });

  describe('static methods', () => {
    it('should write file in one call', async () => {
      const filePath = path.join(testDir, 'static.jsonl');
      const records = [{ id: 1 }, { id: 2 }];

      const count = await StreamingJsonlWriter.writeFile(filePath, records);

      expect(count).toBe(2);

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('should get file size', async () => {
      const filePath = path.join(testDir, 'test.jsonl');
      await StreamingJsonlWriter.writeFile(filePath, [{ id: 1 }]);

      const size = await StreamingJsonlWriter.getFileSize(filePath);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw if writing before open', async () => {
      await expect(writer.writeRecord({ id: 1 })).rejects.toThrow('Stream not opened');
    });

    it('should handle close without open', async () => {
      await expect(writer.close()).resolves.not.toThrow();
    });
  });

  describe('medical use cases', () => {
    it('should stream large clinical dataset', async () => {
      const filePath = path.join(testDir, 'clinical.jsonl');
      await writer.open(filePath);
      
      async function* generateClinicalRecords() {
        for (let i = 0; i < 1000; i++) {
          yield {
            patient_id: `p${i}`,
            note: `Clinical note ${i}`,
            diagnosis: 'condition',
          };
        }
      }

      const count = await writer.writeFromGenerator(generateClinicalRecords);
      await writer.close();

      expect(count).toBe(1000);

      const size = await StreamingJsonlWriter.getFileSize(filePath);
      expect(size).toBeGreaterThan(0);
    });

    it('should stream medical imaging metadata', async () => {
      const filePath = path.join(testDir, 'dicom.jsonl');
      await writer.open(filePath);
      
      const metadata = Array.from({ length: 500 }, (_, i) => ({
        study_id: `study-${i}`,
        series_number: i,
        modality: 'CT',
        slices: 100,
      }));

      const count = await writer.writeArray(metadata, 100);
      await writer.close();

      expect(count).toBe(500);
    });

    it('should transform and stream medical Q&A pairs', async () => {
      const filePath = path.join(testDir, 'medical-qa.jsonl');
      await writer.open(filePath);
      
      const rawData = [
        { question: 'What is diabetes?', answer: 'A metabolic disease...' },
        { question: 'What is hypertension?', answer: 'High blood pressure...' },
      ];

      const count = await writer.writeWithTransform(rawData, (record) => ({
        input: record.question,
        output: record.answer,
        metadata: { domain: 'medical', verified: true },
      }));
      await writer.close();

      expect(count).toBe(2);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('"domain":"medical"');
    });

    it('should handle memory-efficient processing of large dataset', async () => {
      const filePath = path.join(testDir, 'large-clinical.jsonl');
      
      // Simulate processing 100k records without loading all into memory
      async function* generateLargeDataset() {
        for (let i = 0; i < 100000; i++) {
          yield {
            id: i,
            text: `Record ${i}`,
          };
          
          // Simulate async processing
          if (i % 10000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }

      const count = await StreamingJsonlWriter.writeFile(
        filePath,
        generateLargeDataset()
      );

      expect(count).toBe(100000);
    });
  });

  describe('performance', () => {
    it('should handle backpressure', async () => {
      const filePath = path.join(testDir, 'backpressure.jsonl');
      await writer.open(filePath);
      
      // Write many records quickly
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(writer.writeRecord({ id: i, data: 'x'.repeat(100) }));
      }

      await Promise.all(promises);
      await writer.close();

      expect(writer.getRecordCount()).toBe(1000);
    });
  });
});
