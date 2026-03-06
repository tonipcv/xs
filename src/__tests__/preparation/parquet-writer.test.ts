import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParquetWriter } from '@/lib/preparation/compile/formatters/parquet-writer';
import fs from 'fs/promises';
import path from 'path';

describe('ParquetWriter', () => {
  let writer: ParquetWriter;
  let testDir: string;

  beforeEach(async () => {
    writer = new ParquetWriter();
    testDir = path.join('/tmp', `parquet-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('basic operations', () => {
    it('should write records to file', async () => {
      const filePath = path.join(testDir, 'test.parquet');
      const records = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ];

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(2);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.rowGroups).toBeGreaterThan(0);

      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should calculate row groups correctly', async () => {
      const customWriter = new ParquetWriter({ rowGroupSize: 5 });
      const filePath = path.join(testDir, 'test.parquet');
      const records = Array.from({ length: 12 }, (_, i) => ({ id: i }));

      const stats = await customWriter.write(filePath, records);

      expect(stats.totalRecords).toBe(12);
      expect(stats.rowGroups).toBe(3); // 12 / 5 = 2.4 -> ceil = 3
    });

    it('should create directory if not exists', async () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'test.parquet');
      const records = [{ id: 1 }];

      await writer.write(filePath, records);

      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('partitioning', () => {
    it('should write partitioned data', async () => {
      const basePath = path.join(testDir, 'partitioned');
      const records = [
        { id: 1, department: 'engineering', year: 2024 },
        { id: 2, department: 'engineering', year: 2024 },
        { id: 3, department: 'sales', year: 2024 },
        { id: 4, department: 'sales', year: 2025 },
      ];

      const stats = await writer.writePartitioned(basePath, records, ['department', 'year']);

      expect(stats.totalRecords).toBe(4);
      expect(stats.totalBytes).toBeGreaterThan(0);

      // Check partition directories exist
      const eng2024 = path.join(basePath, 'department=engineering', 'year=2024', 'data.parquet');
      const sales2024 = path.join(basePath, 'department=sales', 'year=2024', 'data.parquet');
      const sales2025 = path.join(basePath, 'department=sales', 'year=2025', 'data.parquet');

      const eng2024Exists = await fs.access(eng2024).then(() => true).catch(() => false);
      const sales2024Exists = await fs.access(sales2024).then(() => true).catch(() => false);
      const sales2025Exists = await fs.access(sales2025).then(() => true).catch(() => false);

      expect(eng2024Exists).toBe(true);
      expect(sales2024Exists).toBe(true);
      expect(sales2025Exists).toBe(true);
    });

    it('should partition by single key', async () => {
      const basePath = path.join(testDir, 'single-partition');
      const records = [
        { id: 1, category: 'A' },
        { id: 2, category: 'A' },
        { id: 3, category: 'B' },
      ];

      const stats = await writer.writePartitioned(basePath, records, ['category']);

      expect(stats.totalRecords).toBe(3);

      const categoryA = path.join(basePath, 'category=A', 'data.parquet');
      const categoryB = path.join(basePath, 'category=B', 'data.parquet');

      const aExists = await fs.access(categoryA).then(() => true).catch(() => false);
      const bExists = await fs.access(categoryB).then(() => true).catch(() => false);

      expect(aExists).toBe(true);
      expect(bExists).toBe(true);
    });
  });

  describe('schema operations', () => {
    it('should infer schema from records', () => {
      const records = [
        { id: 1, name: 'Alice', age: 30, active: true },
        { id: 2, name: 'Bob', age: 25, active: false },
      ];

      const schema = writer.inferSchema(records);

      expect(schema).toEqual({
        id: 'number',
        name: 'string',
        age: 'number',
        active: 'boolean',
      });
    });

    it('should return empty schema for empty records', () => {
      const schema = writer.inferSchema([]);
      expect(schema).toEqual({});
    });

    it('should validate records against schema', () => {
      const schema = {
        id: 'number',
        name: 'string',
        age: 'number',
      };

      const validRecords = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ];

      const invalidRecords = [
        { id: 1, name: 'Alice', age: '30' }, // age should be number
      ];

      expect(writer.validateRecords(validRecords, schema)).toBe(true);
      expect(writer.validateRecords(invalidRecords, schema)).toBe(false);
    });

    it('should allow null values in validation', () => {
      const schema = {
        id: 'number',
        name: 'string',
        age: 'number',
      };

      const recordsWithNull = [
        { id: 1, name: 'Alice', age: null },
      ];

      expect(writer.validateRecords(recordsWithNull, schema)).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use custom row group size', () => {
      const customWriter = new ParquetWriter({ rowGroupSize: 1000 });
      expect(customWriter).toBeDefined();
    });

    it('should use custom compression', () => {
      const customWriter = new ParquetWriter({ compression: 'gzip' });
      expect(customWriter).toBeDefined();
    });

    it('should use default config', () => {
      const defaultWriter = new ParquetWriter();
      expect(defaultWriter).toBeDefined();
    });
  });

  describe('medical use cases', () => {
    it('should write clinical data to parquet', async () => {
      const filePath = path.join(testDir, 'clinical.parquet');
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

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(2);
      expect(stats.totalBytes).toBeGreaterThan(0);
    });

    it('should partition medical data by year and department', async () => {
      const basePath = path.join(testDir, 'medical-partitioned');
      const records = [
        { patient_id: 'p001', department: 'cardiology', year: 2024, diagnosis: 'AFib' },
        { patient_id: 'p002', department: 'cardiology', year: 2024, diagnosis: 'CAD' },
        { patient_id: 'p003', department: 'oncology', year: 2024, diagnosis: 'Breast Cancer' },
        { patient_id: 'p004', department: 'oncology', year: 2025, diagnosis: 'Lung Cancer' },
      ];

      const stats = await writer.writePartitioned(basePath, records, ['department', 'year']);

      expect(stats.totalRecords).toBe(4);

      const cardio2024 = path.join(basePath, 'department=cardiology', 'year=2024', 'data.parquet');
      const onco2024 = path.join(basePath, 'department=oncology', 'year=2024', 'data.parquet');

      const cardioExists = await fs.access(cardio2024).then(() => true).catch(() => false);
      const oncoExists = await fs.access(onco2024).then(() => true).catch(() => false);

      expect(cardioExists).toBe(true);
      expect(oncoExists).toBe(true);
    });

    it('should infer schema from medical imaging metadata', () => {
      const records = [
        {
          study_id: 'study-001',
          series_number: 1,
          modality: 'CT',
          slices: 100,
          pixel_spacing: 0.5,
        },
      ];

      const schema = writer.inferSchema(records);

      expect(schema).toEqual({
        study_id: 'string',
        series_number: 'number',
        modality: 'string',
        slices: 'number',
        pixel_spacing: 'number',
      });
    });

    it('should handle large medical dataset', async () => {
      const filePath = path.join(testDir, 'large-medical.parquet');
      const records = Array.from({ length: 10000 }, (_, i) => ({
        patient_id: `p${i}`,
        diagnosis: 'Condition',
        age: 30 + (i % 50),
        visit_date: '2024-01-01',
      }));

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(10000);
      expect(stats.rowGroups).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty records array', async () => {
      const filePath = path.join(testDir, 'empty.parquet');
      const records: unknown[] = [];

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(0);
      expect(stats.rowGroups).toBe(0);
    });

    it('should handle records with nested objects', async () => {
      const filePath = path.join(testDir, 'nested.parquet');
      const records = [
        {
          id: 1,
          user: {
            name: 'Alice',
            address: {
              city: 'NYC',
            },
          },
        },
      ];

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(1);
    });

    it('should handle records with arrays', async () => {
      const filePath = path.join(testDir, 'arrays.parquet');
      const records = [
        {
          id: 1,
          tags: ['medical', 'urgent'],
          scores: [1, 2, 3],
        },
      ];

      const stats = await writer.write(filePath, records);

      expect(stats.totalRecords).toBe(1);
    });
  });
});
