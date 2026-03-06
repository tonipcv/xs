import { describe, it, expect, vi } from 'vitest';
import { ImagePreparer, ImagePreparationConfig } from '@/lib/preparation/multimodal/image-preparer';

describe('ImagePreparer', () => {
  const createPreparer = () => new ImagePreparer();

  describe('basic preparation', () => {
    it('should prepare CT image', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        windowCenter: 40,
        windowWidth: 400,
      };

      const result = await preparer.prepareImage(
        '/path/to/ct.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
      expect(result.manifest.modality).toBe('CT');
      expect(result.stats.voxelCount).toBeGreaterThan(0);
    });

    it('should apply windowing', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        windowCenter: 50,
        windowWidth: 350,
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
      expect(result.stats.minValue).toBeGreaterThanOrEqual(0);
      expect(result.stats.maxValue).toBeLessThanOrEqual(255);
    });

    it('should normalize image', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        normalize: true,
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
    });
  });

  describe('format conversion', () => {
    it('should export to NIfTI', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
    });

    it('should export to PNG slices', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'png',
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output/',
        config
      );

      expect(result.success).toBe(true);
      expect(result.slices).toBeDefined();
      expect(result.slices?.length).toBeGreaterThan(0);
    });
  });

  describe('resampling', () => {
    it('should resample to target shape', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        targetShape: [64, 128, 128],
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
      expect(result.manifest.shape).toEqual([64, 128, 128]);
    });

    it('should resample to target spacing', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        targetSpacing: [2.0, 2.0, 2.0],
      };

      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
      expect(result.manifest.spacing).toEqual([2.0, 2.0, 2.0]);
    });
  });

  describe('batch processing', () => {
    it('should process multiple images', async () => {
      const preparer = createPreparer();
      const files = [
        { id: 'ct-1', path: '/path/to/ct1.dcm' },
        { id: 'ct-2', path: '/path/to/ct2.dcm' },
        { id: 'mr-1', path: '/path/to/mr1.dcm' },
      ];
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
      };

      const results = await preparer.batchPrepare(files, '/output', config);

      expect(results.size).toBe(3);
      for (const result of results.values()) {
        expect(result.success).toBe(true);
      }
    });

    it('should track batch progress', async () => {
      const preparer = createPreparer();
      const files = Array.from({ length: 5 }, (_, i) => ({
        id: `image-${i}`,
        path: `/path/to/image${i}.dcm`,
      }));
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
      };
      const progressFn = vi.fn();

      await preparer.batchPrepare(files, '/output', config, progressFn);

      expect(progressFn).toHaveBeenCalledTimes(5);
      expect(progressFn).toHaveBeenLastCalledWith(5, 5);
    });
  });

  describe('manifest generation', () => {
    it('should generate image manifest', async () => {
      const preparer = createPreparer();
      const files = [
        { id: 'ct-1', path: '/path/to/ct1.dcm' },
        { id: 'ct-2', path: '/path/to/ct2.dcm' },
        { id: 'mr-1', path: '/path/to/mr1.dcm' },
      ];
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
      };

      const results = await preparer.batchPrepare(files, '/output', config);
      const manifest = preparer.generateManifest(results);

      expect(manifest.version).toBe('1.0');
      expect(manifest.totalImages).toBe(3);
      expect(Object.keys(manifest.modalities)).toContain('CT');
      expect(manifest.images).toHaveLength(3);
    });

    it('should include labels in manifest', async () => {
      const preparer = createPreparer();
      const result = await preparer.prepareImage(
        '/path/to/ct.dcm',
        '/path/to/output.nii',
        { outputFormat: 'nifti' }
      );

      const results = new Map([['ct-1', result]]);
      const manifest = preparer.generateManifest(results);

      expect(manifest.images[0].labels).toBeDefined();
    });
  });

  describe('medical use cases', () => {
    it('should handle CT scan with tumor', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        windowCenter: 40,
        windowWidth: 400,
      };

      const result = await preparer.prepareImage(
        '/path/to/tumor-ct.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
      expect(result.manifest.labels).toBeDefined();
      expect(result.stats.voxelCount).toBeGreaterThan(0);
    });

    it('should handle MRI with contrast', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'nifti',
        normalize: true,
      };

      const result = await preparer.prepareImage(
        '/path/to/mri-contrast.dcm',
        '/path/to/output.nii',
        config
      );

      expect(result.success).toBe(true);
    });

    it('should export radiology for training', async () => {
      const preparer = createPreparer();
      const config: ImagePreparationConfig = {
        outputFormat: 'png',
        targetShape: [64, 256, 256],
        normalize: true,
      };

      const result = await preparer.prepareImage(
        '/path/to/radiology.dcm',
        '/output/slices/',
        config
      );

      expect(result.success).toBe(true);
      expect(result.slices).toBeDefined();
      expect(result.slices?.length).toBe(64);
    });
  });

  describe('statistics calculation', () => {
    it('should calculate image statistics', async () => {
      const preparer = createPreparer();
      const result = await preparer.prepareImage(
        '/path/to/image.dcm',
        '/path/to/output.nii',
        { outputFormat: 'nifti' }
      );

      expect(result.stats.minValue).toBeLessThanOrEqual(result.stats.maxValue);
      expect(result.stats.meanValue).toBeGreaterThanOrEqual(result.stats.minValue);
      expect(result.stats.meanValue).toBeLessThanOrEqual(result.stats.maxValue);
      expect(result.stats.stdValue).toBeGreaterThanOrEqual(0);
      expect(result.stats.voxelCount).toBeGreaterThan(0);
    });
  });
});
