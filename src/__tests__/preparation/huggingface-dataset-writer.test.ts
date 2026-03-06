import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HuggingFaceDatasetWriter } from '@/lib/preparation/compile/formatters/huggingface-dataset-writer';
import fs from 'fs/promises';
import path from 'path';

describe('HuggingFaceDatasetWriter', () => {
  let writer: HuggingFaceDatasetWriter;
  let testDir: string;

  beforeEach(async () => {
    writer = new HuggingFaceDatasetWriter({
      datasetName: 'test-dataset',
      description: 'Test dataset for unit tests',
      license: 'MIT',
    });
    testDir = path.join('/tmp', `hf-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('single split', () => {
    it('should write dataset with single split', async () => {
      const records = [
        { id: 1, text: 'Hello world', label: 'greeting' },
        { id: 2, text: 'Goodbye', label: 'farewell' },
      ];

      await writer.write(testDir, records, 'train');

      // Check dataset_infos.json exists
      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosExists = await fs.access(infosPath).then(() => true).catch(() => false);
      expect(infosExists).toBe(true);

      // Check state.json exists
      const statePath = path.join(testDir, 'state.json');
      const stateExists = await fs.access(statePath).then(() => true).catch(() => false);
      expect(stateExists).toBe(true);

      // Check README.md exists
      const readmePath = path.join(testDir, 'README.md');
      const readmeExists = await fs.access(readmePath).then(() => true).catch(() => false);
      expect(readmeExists).toBe(true);

      // Check data directory exists
      const dataDir = path.join(testDir, 'data');
      const dataDirExists = await fs.access(dataDir).then(() => true).catch(() => false);
      expect(dataDirExists).toBe(true);
    });

    it('should create correct dataset_infos.json structure', async () => {
      const records = [
        { id: 1, text: 'Sample', score: 0.9 },
      ];

      await writer.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['test-dataset']).toBeDefined();
      expect(infos['test-dataset'].description).toBe('Test dataset for unit tests');
      expect(infos['test-dataset'].features).toBeDefined();
      expect(infos['test-dataset'].splits).toBeDefined();
      expect(infos['test-dataset'].splits.train).toBeDefined();
      expect(infos['test-dataset'].splits.train.num_examples).toBe(1);
    });

    it('should infer features correctly', async () => {
      const records = [
        { 
          id: 1, 
          text: 'Sample', 
          score: 0.9, 
          active: true,
          tags: ['a', 'b'],
        },
      ];

      await writer.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      const features = infos['test-dataset'].features;
      expect(features.id.dtype).toBe('int64');
      expect(features.text.dtype).toBe('string');
      expect(features.score.dtype).toBe('float64');
      expect(features.active.dtype).toBe('bool');
      expect(features.tags.dtype).toBe('list');
    });

    it('should create data shards', async () => {
      const customWriter = new HuggingFaceDatasetWriter({
        datasetName: 'test-dataset',
        description: 'Test',
        shardSize: 2,
      });

      const records = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ];

      await customWriter.write(testDir, records, 'train');

      const dataDir = path.join(testDir, 'data');
      const files = await fs.readdir(dataDir);
      
      // Should create 3 shards (2+2+1)
      expect(files.length).toBe(3);
      expect(files[0]).toContain('train-00000-of-00003');
      expect(files[1]).toContain('train-00001-of-00003');
      expect(files[2]).toContain('train-00002-of-00003');
    });
  });

  describe('multiple splits', () => {
    it('should write multiple splits', async () => {
      const splits = {
        train: [
          { id: 1, text: 'Train 1' },
          { id: 2, text: 'Train 2' },
        ],
        test: [
          { id: 3, text: 'Test 1' },
        ],
        validation: [
          { id: 4, text: 'Val 1' },
        ],
      };

      await writer.writeMultipleSplits(testDir, splits);

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['test-dataset'].splits.train).toBeDefined();
      expect(infos['test-dataset'].splits.test).toBeDefined();
      expect(infos['test-dataset'].splits.validation).toBeDefined();

      expect(infos['test-dataset'].splits.train.num_examples).toBe(2);
      expect(infos['test-dataset'].splits.test.num_examples).toBe(1);
      expect(infos['test-dataset'].splits.validation.num_examples).toBe(1);
    });

    it('should create separate shard files for each split', async () => {
      const splits = {
        train: [{ id: 1 }],
        test: [{ id: 2 }],
      };

      await writer.writeMultipleSplits(testDir, splits);

      const dataDir = path.join(testDir, 'data');
      const files = await fs.readdir(dataDir);

      const trainFiles = files.filter(f => f.startsWith('train-'));
      const testFiles = files.filter(f => f.startsWith('test-'));

      expect(trainFiles.length).toBeGreaterThan(0);
      expect(testFiles.length).toBeGreaterThan(0);
    });
  });

  describe('README generation', () => {
    it('should generate README with dataset info', async () => {
      const records = [{ id: 1, text: 'Sample' }];

      await writer.write(testDir, records, 'train');

      const readmePath = path.join(testDir, 'README.md');
      const readme = await fs.readFile(readmePath, 'utf-8');

      expect(readme).toContain('# test-dataset');
      expect(readme).toContain('Test dataset for unit tests');
      expect(readme).toContain('## Dataset Structure');
      expect(readme).toContain('## Usage');
      expect(readme).toContain('load_dataset');
    });

    it('should include citation if provided', async () => {
      const writerWithCitation = new HuggingFaceDatasetWriter({
        datasetName: 'test-dataset',
        description: 'Test',
        citation: '@article{test2024}',
      });

      const records = [{ id: 1 }];
      await writerWithCitation.write(testDir, records, 'train');

      const readmePath = path.join(testDir, 'README.md');
      const readme = await fs.readFile(readmePath, 'utf-8');

      expect(readme).toContain('## Citation');
      expect(readme).toContain('@article{test2024}');
    });

    it('should include license if provided', async () => {
      const records = [{ id: 1 }];
      await writer.write(testDir, records, 'train');

      const readmePath = path.join(testDir, 'README.md');
      const readme = await fs.readFile(readmePath, 'utf-8');

      expect(readme).toContain('## License');
      expect(readme).toContain('MIT');
    });
  });

  describe('state.json', () => {
    it('should create valid state.json', async () => {
      const records = [{ id: 1 }];
      await writer.write(testDir, records, 'train');

      const statePath = path.join(testDir, 'state.json');
      const stateContent = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateContent);

      expect(state._data_files).toBeDefined();
      expect(Array.isArray(state._data_files)).toBe(true);
      expect(state._fingerprint).toBeDefined();
      expect(state._output_all_columns).toBe(true);
      expect(state._split).toBe('train');
    });

    it('should list all data files in state', async () => {
      const customWriter = new HuggingFaceDatasetWriter({
        datasetName: 'test-dataset',
        description: 'Test',
        shardSize: 1,
      });

      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
      await customWriter.write(testDir, records, 'train');

      const statePath = path.join(testDir, 'state.json');
      const stateContent = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateContent);

      expect(state._data_files.length).toBe(3);
      expect(state._data_files[0].split).toBe('train');
      expect(state._data_files[0].filename).toContain('data/train-');
    });
  });

  describe('medical use cases', () => {
    it('should write clinical notes dataset', async () => {
      const records = [
        {
          patient_id: 'p001',
          note: 'Patient presents with chest pain',
          diagnosis: 'Angina',
          date: '2024-01-01',
        },
        {
          patient_id: 'p002',
          note: 'Follow-up visit',
          diagnosis: 'Hypertension',
          date: '2024-01-02',
        },
      ];

      const medicalWriter = new HuggingFaceDatasetWriter({
        datasetName: 'clinical-notes',
        description: 'De-identified clinical notes dataset',
        license: 'CC-BY-NC-4.0',
      });

      await medicalWriter.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['clinical-notes']).toBeDefined();
      expect(infos['clinical-notes'].features.patient_id).toBeDefined();
      expect(infos['clinical-notes'].features.note).toBeDefined();
      expect(infos['clinical-notes'].features.diagnosis).toBeDefined();
    });

    it('should write medical imaging metadata', async () => {
      const records = [
        {
          study_id: 'study-001',
          modality: 'CT',
          body_part: 'chest',
          slices: 100,
          pixel_spacing: 0.5,
        },
      ];

      const imagingWriter = new HuggingFaceDatasetWriter({
        datasetName: 'medical-imaging-metadata',
        description: 'Medical imaging study metadata',
      });

      await imagingWriter.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['medical-imaging-metadata'].features.modality).toBeDefined();
      expect(infos['medical-imaging-metadata'].features.slices.dtype).toBe('int64');
      expect(infos['medical-imaging-metadata'].features.pixel_spacing.dtype).toBe('float64');
    });

    it('should write train/val/test splits for medical data', async () => {
      const splits = {
        train: Array.from({ length: 100 }, (_, i) => ({
          patient_id: `p${i}`,
          diagnosis: 'Condition',
        })),
        validation: Array.from({ length: 20 }, (_, i) => ({
          patient_id: `v${i}`,
          diagnosis: 'Condition',
        })),
        test: Array.from({ length: 30 }, (_, i) => ({
          patient_id: `t${i}`,
          diagnosis: 'Condition',
        })),
      };

      const medicalWriter = new HuggingFaceDatasetWriter({
        datasetName: 'medical-dataset',
        description: 'Medical dataset with train/val/test splits',
      });

      await medicalWriter.writeMultipleSplits(testDir, splits);

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['medical-dataset'].splits.train.num_examples).toBe(100);
      expect(infos['medical-dataset'].splits.validation.num_examples).toBe(20);
      expect(infos['medical-dataset'].splits.test.num_examples).toBe(30);
    });
  });

  describe('edge cases', () => {
    it('should handle empty records', async () => {
      const records: unknown[] = [];

      // Empty records should still create valid structure
      await writer.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosExists = await fs.access(infosPath).then(() => true).catch(() => false);
      expect(infosExists).toBe(true);
    });

    it('should handle single record', async () => {
      const records = [{ id: 1, text: 'Single' }];

      await writer.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['test-dataset'].splits.train.num_examples).toBe(1);
    });

    it('should handle large dataset with multiple shards', async () => {
      const customWriter = new HuggingFaceDatasetWriter({
        datasetName: 'large-dataset',
        description: 'Large dataset',
        shardSize: 1000,
      });

      const records = Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        text: `Record ${i}`,
      }));

      await customWriter.write(testDir, records, 'train');

      const dataDir = path.join(testDir, 'data');
      const files = await fs.readdir(dataDir);

      expect(files.length).toBe(5); // 5000 / 1000 = 5 shards
    });

    it('should handle records with null values', async () => {
      const records = [
        { id: 1, text: 'Sample', optional: null },
      ];

      await writer.write(testDir, records, 'train');

      const infosPath = path.join(testDir, 'dataset_infos.json');
      const infosContent = await fs.readFile(infosPath, 'utf-8');
      const infos = JSON.parse(infosContent);

      expect(infos['test-dataset'].features.optional).toBeDefined();
    });
  });
});
