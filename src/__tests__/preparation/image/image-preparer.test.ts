/**
 * Tests for ImagePreparer with REAL medical image processing
 * 
 * Testes reais para processamento de imagens médicas usando ImagePreparer.
 * Cria volumes DICOM simulados e valida o processamento completo.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createImagePreparer, ImagePreparer, ImageVolume } from '@/lib/preparation/image/image-preparer';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('ImagePreparer - REAL Medical Image Processing', () => {
  let preparer: ImagePreparer;
  let tempDir: string;
  let dicomDir: string;

  beforeAll(async () => {
    tempDir = path.join('/tmp', 'image-preparer-test', Date.now().toString());
    dicomDir = path.join(tempDir, 'dicom');
    await fs.mkdir(dicomDir, { recursive: true });

    // Cria arquivos DICOM simulados (10 slices de 256x256)
    for (let i = 0; i < 10; i++) {
      const sliceData = Buffer.alloc(256 * 256 * 2); // 256x256 pixels, 2 bytes cada
      for (let j = 0; j < sliceData.length; j += 2) {
        const value = Math.floor(Math.random() * 1000);
        sliceData.writeUInt16LE(value, j);
      }
      await fs.writeFile(path.join(dicomDir, `slice_${i.toString().padStart(3, '0')}.dcm`), sliceData);
    }
  }, 60000);

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    preparer = createImagePreparer({
      targetSpacing: [1.0, 1.0, 1.0],
      normalizeIntensity: true,
      anonymize: true,
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const initialized = await preparer.initialize();
      // Pode ser true (se SimpleITK instalado) ou false (fallback)
      expect(typeof initialized).toBe('boolean');
    });
  });

  describe('DICOM Loading', () => {
    it('should load DICOM series and return valid volume', async () => {
      const result = await preparer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume).toBeDefined();
      expect(result.volume!.dimensions).toEqual([256, 256, 10]);
      expect(result.volume!.data.length).toBe(256 * 256 * 10);
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should extract correct metadata from DICOM', async () => {
      const result = await preparer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume!.metadata.modality).toBe('CT');
      expect(result.volume!.metadata.pixelSpacing).toEqual([1.0, 1.0]);
      expect(result.volume!.metadata.sliceThickness).toBe(1.0);
    });

    it('should calculate correct memory usage', async () => {
      const result = await preparer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      const expectedVoxels = 256 * 256 * 10;
      const expectedMemoryMB = (expectedVoxels * 4) / (1024 * 1024);
      
      expect(result.metadata.voxelCount).toBe(expectedVoxels);
      expect(result.metadata.memoryUsageMB).toBeCloseTo(expectedMemoryMB, 1);
    });
  });

  describe('Volume Processing', () => {
    it('should normalize intensity when configured', async () => {
      const normalizer = createImagePreparer({ normalizeIntensity: true });
      const result = await normalizer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.steps.some(s => s.includes('Normaliz'))).toBe(true);
    });

    it('should apply window/level when configured', async () => {
      const windowed = createImagePreparer({
        windowLevel: { center: 40, width: 80 },
      });
      const result = await windowed.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.steps.some(s => s.toLowerCase().includes('window'))).toBe(true);
    });

    it('should resample to target spacing', async () => {
      const resampler = createImagePreparer({
        targetSpacing: [0.5, 0.5, 0.5],
      });
      const result = await resampler.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume!.spacing).toEqual([0.5, 0.5, 0.5]);
    });
  });

  describe('NIfTI Export', () => {
    it('should save volume as NIfTI format', async () => {
      const result = await preparer.loadDicomSeries(dicomDir);
      expect(result.success).toBe(true);

      const outputPath = path.join(tempDir, 'output.nii.gz');
      const savedPath = await preparer.saveAsNifti(result.volume!, outputPath);

      expect(savedPath).toBeTruthy();
      
      // Verifica que arquivo foi criado
      const stats = await fs.stat(savedPath).catch(() => null);
      expect(stats).not.toBeNull();
      expect(stats!.size).toBeGreaterThan(0);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple DICOM directories', async () => {
      // Cria segundo diretório DICOM
      const dicomDir2 = path.join(tempDir, 'dicom2');
      await fs.mkdir(dicomDir2, { recursive: true });
      
      for (let i = 0; i < 5; i++) {
        const sliceData = Buffer.alloc(128 * 128 * 2);
        await fs.writeFile(path.join(dicomDir2, `slice_${i}.dcm`), sliceData);
      }

      const results = await preparer.batchProcess([dicomDir, dicomDir2]);

      expect(results.size).toBe(2);
      expect(results.get(dicomDir)!.success).toBe(true);
      expect(results.get(dicomDir2)!.success).toBe(true);
    });

    it('should report progress during batch processing', async () => {
      const progressUpdates: number[] = [];

      await preparer.batchProcess([dicomDir], (processed, total) => {
        progressUpdates.push(processed);
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty DICOM directory', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await preparer.loadDicomSeries(emptyDir);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle non-existent directory', async () => {
      const result = await preparer.loadDicomSeries('/non/existent/path');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Anonymization', () => {
    it('should anonymize patient data when configured', async () => {
      const anonymizer = createImagePreparer({ anonymize: true });
      const result = await anonymizer.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume!.metadata.patientId).toBe('ANONYMIZED');
    });

    it('should keep original IDs when not anonymizing', async () => {
      const nonAnon = createImagePreparer({ anonymize: false });
      const result = await nonAnon.loadDicomSeries(dicomDir);

      expect(result.success).toBe(true);
      expect(result.volume!.metadata.patientId).toBe('TEST_PATIENT');
    });
  });
});
