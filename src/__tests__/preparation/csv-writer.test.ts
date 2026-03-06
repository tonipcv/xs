import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CsvWriter } from '@/lib/preparation/compile/formatters/csv-writer';
import fs from 'fs/promises';
import path from 'path';

describe('CsvWriter', () => {
  let writer: CsvWriter;
  let testDir: string;

  beforeEach(async () => {
    writer = new CsvWriter();
    testDir = path.join('/tmp', `csv-test-${Date.now()}`);
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
    it('should write simple CSV', async () => {
      const filePath = path.join(testDir, 'test.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({ id: 1, name: 'Alice', age: 30 });
      await writer.writeRecord({ id: 2, name: 'Bob', age: 25 });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[0]).toBe('id,name,age');
      expect(lines[1]).toBe('1,Alice,30');
      expect(lines[2]).toBe('2,Bob,25');
    });

    it('should track record count', async () => {
      const filePath = path.join(testDir, 'test.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({ id: 1 });
      await writer.writeRecord({ id: 2 });
      
      expect(writer.getRecordCount()).toBe(2);
      await writer.close();
    });

    it('should write without header', async () => {
      const writerNoHeader = new CsvWriter({ includeHeader: false });
      const filePath = path.join(testDir, 'no-header.csv');
      
      await writerNoHeader.open(filePath);
      await writerNoHeader.writeRecord({ id: 1, name: 'Test' });
      await writerNoHeader.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('1,Test');
    });
  });

  describe('flattening', () => {
    it('should flatten nested objects', async () => {
      const filePath = path.join(testDir, 'nested.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        user: {
          name: 'Alice',
          address: {
            city: 'NYC',
          },
        },
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('user.name');
      expect(content).toContain('user.address.city');
      expect(content).toContain('Alice');
      expect(content).toContain('NYC');
    });

    it('should handle arrays as JSON', async () => {
      const filePath = path.join(testDir, 'arrays.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        tags: ['medical', 'urgent'],
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      // CSV escapes quotes by doubling them
      expect(content).toContain('[""medical"",""urgent""]');
    });

    it('should handle null and undefined', async () => {
      const filePath = path.join(testDir, 'nulls.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        value: null,
        missing: undefined,
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines[1]).toBe('1,,');
    });
  });

  describe('escaping', () => {
    it('should escape commas', async () => {
      const filePath = path.join(testDir, 'commas.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        text: 'Hello, World',
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('"Hello, World"');
    });

    it('should escape quotes', async () => {
      const filePath = path.join(testDir, 'quotes.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        text: 'She said "Hello"',
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('She said ""Hello""');
    });

    it('should escape newlines', async () => {
      const filePath = path.join(testDir, 'newlines.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        text: 'Line 1\nLine 2',
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('"Line 1\nLine 2"');
    });
  });

  describe('configuration', () => {
    it('should use custom delimiter', async () => {
      const customWriter = new CsvWriter({ delimiter: ';' });
      const filePath = path.join(testDir, 'semicolon.csv');
      
      await customWriter.open(filePath);
      await customWriter.writeRecord({ id: 1, name: 'Test' });
      await customWriter.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('id;name');
      expect(content).toContain('1;Test');
    });

    it('should truncate long cells', async () => {
      const customWriter = new CsvWriter({ maxCellLength: 10 });
      const filePath = path.join(testDir, 'truncate.csv');
      
      await customWriter.open(filePath);
      await customWriter.writeRecord({
        id: 1,
        text: 'This is a very long text that should be truncated',
      });
      await customWriter.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      // Text is truncated to 10 chars: "This is a" (without trailing space)
      expect(lines[1]).toBe('1,This is a');
    });

    it('should reject too many columns', async () => {
      const customWriter = new CsvWriter({ maxColumns: 2 });
      const filePath = path.join(testDir, 'too-many.csv');
      
      await customWriter.open(filePath);
      
      await expect(
        customWriter.writeRecord({ a: 1, b: 2, c: 3 })
      ).rejects.toThrow('Too many columns');
      
      await customWriter.close();
    });
  });

  describe('batch operations', () => {
    it('should write multiple records', async () => {
      const filePath = path.join(testDir, 'batch.csv');
      await writer.open(filePath);
      
      const records = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ];

      const count = await writer.writeRecords(records);
      await writer.close();

      expect(count).toBe(3);

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(4); // header + 3 rows
    });
  });

  describe('static methods', () => {
    it('should write file in one call', async () => {
      const filePath = path.join(testDir, 'static.csv');
      const records = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const count = await CsvWriter.writeFile(filePath, records);

      expect(count).toBe(2);

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should get file size', async () => {
      const filePath = path.join(testDir, 'test.csv');
      await CsvWriter.writeFile(filePath, [{ id: 1 }]);

      const size = await CsvWriter.getFileSize(filePath);
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
    it('should export clinical data to CSV', async () => {
      const filePath = path.join(testDir, 'clinical.csv');
      await writer.open(filePath);
      
      const records = [
        {
          patient_id: 'p001',
          diagnosis: 'Type 2 Diabetes',
          age: 55,
          medications: ['Metformin', 'Insulin'],
        },
        {
          patient_id: 'p002',
          diagnosis: 'Hypertension',
          age: 62,
          medications: ['Lisinopril'],
        },
      ];

      await writer.writeRecords(records);
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('patient_id');
      expect(content).toContain('diagnosis');
      expect(content).toContain('Type 2 Diabetes');
    });

    it('should handle medical notes with special characters', async () => {
      const filePath = path.join(testDir, 'notes.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        patient_id: 'p001',
        note: 'Patient presents with "acute" symptoms, including:\n- Fever\n- Cough',
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('Patient presents with ""acute"" symptoms');
    });

    it('should flatten nested medical metadata', async () => {
      const filePath = path.join(testDir, 'metadata.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        study_id: 'study-001',
        patient: {
          id: 'p001',
          demographics: {
            age: 45,
            gender: 'F',
          },
        },
        diagnosis: {
          primary: 'Diabetes',
          secondary: ['Hypertension', 'Obesity'],
        },
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('patient.id');
      expect(content).toContain('patient.demographics.age');
      expect(content).toContain('diagnosis.primary');
    });

    it('should handle large medical dataset export', async () => {
      const filePath = path.join(testDir, 'large.csv');
      await writer.open(filePath);
      
      const records = Array.from({ length: 1000 }, (_, i) => ({
        patient_id: `p${i}`,
        diagnosis: 'Condition',
        age: 30 + (i % 50),
      }));

      const count = await writer.writeRecords(records);
      await writer.close();

      expect(count).toBe(1000);

      const size = await CsvWriter.getFileSize(filePath);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('UTF-8 encoding', () => {
    it('should handle UTF-8 characters', async () => {
      const filePath = path.join(testDir, 'utf8.csv');
      await writer.open(filePath);
      
      await writer.writeRecord({
        id: 1,
        name: 'José García',
        note: '患者の症状',
      });
      await writer.close();

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('José García');
      expect(content).toContain('患者の症状');
    });
  });
});
