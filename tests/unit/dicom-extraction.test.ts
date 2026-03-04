/**
 * Unit Tests: DICOM 3D Volume Extraction
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  extractDicomMetadata,
  extractVolume,
  generateVolumePreviews,
  calculateVolumeStatistics,
  segmentVolume,
} from '@/lib/dicom/volume-extractor';

describe('DICOM Volume Extraction', () => {
  let testDicomDir: string;
  let testOutputDir: string;

  beforeAll(async () => {
    testDicomDir = await fs.mkdtemp(path.join('/tmp', 'dicom-test-'));
    testOutputDir = await fs.mkdtemp(path.join('/tmp', 'dicom-output-'));
    
    // Generate synthetic DICOM series for testing
    await generateSyntheticDicomSeries(testDicomDir, 10);
  });

  afterAll(async () => {
    await fs.rm(testDicomDir, { recursive: true, force: true });
    await fs.rm(testOutputDir, { recursive: true, force: true });
  });

  describe('extractDicomMetadata', () => {
    it('should extract metadata from DICOM series', async () => {
      const metadata = await extractDicomMetadata(testDicomDir);

      expect(metadata).toBeDefined();
      expect(metadata.seriesInstanceUID).toBeDefined();
      expect(metadata.studyInstanceUID).toBeDefined();
      expect(metadata.patientID).toBeDefined();
      expect(metadata.modality).toBeDefined();
      expect(metadata.sliceCount).toBeGreaterThan(0);
      expect(metadata.dimensions).toBeDefined();
      expect(metadata.dimensions.width).toBeGreaterThan(0);
      expect(metadata.dimensions.height).toBeGreaterThan(0);
      expect(metadata.dimensions.depth).toBeGreaterThan(0);
      expect(metadata.spacing).toBeDefined();
      expect(metadata.spacing.x).toBeGreaterThan(0);
      expect(metadata.spacing.y).toBeGreaterThan(0);
      expect(metadata.spacing.z).toBeGreaterThan(0);
    });

    it('should handle missing DICOM directory', async () => {
      await expect(
        extractDicomMetadata('/nonexistent/path')
      ).rejects.toThrow();
    });
  });

  describe('extractVolume', () => {
    it('should extract volume in NIfTI format', async () => {
      const outputPath = path.join(testOutputDir, 'volume_nifti');
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'nifti',
      });

      expect(metadata).toBeDefined();
      expect(metadata.dimensions).toBeDefined();
      
      // Check output file exists
      const niftiPath = outputPath + '.nii.gz';
      const fileExists = await fs.access(niftiPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Check file size
      const stats = await fs.stat(niftiPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should extract volume in NRRD format', async () => {
      const outputPath = path.join(testOutputDir, 'volume_nrrd');
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'nrrd',
      });

      expect(metadata).toBeDefined();
      
      const nrrdPath = outputPath + '.nrrd';
      const fileExists = await fs.access(nrrdPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should extract volume in RAW format with metadata', async () => {
      const outputPath = path.join(testOutputDir, 'volume_raw');
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'raw',
      });

      expect(metadata).toBeDefined();
      
      const rawPath = outputPath + '.raw';
      const jsonPath = outputPath + '.json';
      
      const rawExists = await fs.access(rawPath).then(() => true).catch(() => false);
      const jsonExists = await fs.access(jsonPath).then(() => true).catch(() => false);
      
      expect(rawExists).toBe(true);
      expect(jsonExists).toBe(true);
      
      // Verify JSON metadata
      const metadataJson = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      expect(metadataJson.dimensions).toBeDefined();
      expect(metadataJson.spacing).toBeDefined();
    });

    it('should resample volume to target spacing', async () => {
      const outputPath = path.join(testOutputDir, 'volume_resampled');
      const targetSpacing: [number, number, number] = [1.0, 1.0, 1.0];
      
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'nifti',
        resample: true,
        targetSpacing,
      });

      expect(metadata.spacing.x).toBeCloseTo(targetSpacing[0], 1);
      expect(metadata.spacing.y).toBeCloseTo(targetSpacing[1], 1);
      expect(metadata.spacing.z).toBeCloseTo(targetSpacing[2], 1);
    });

    it('should normalize volume intensities', async () => {
      const outputPath = path.join(testOutputDir, 'volume_normalized');
      
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'nifti',
        normalize: true,
      });

      expect(metadata).toBeDefined();
      
      // Verify file was created
      const niftiPath = outputPath + '.nii.gz';
      const fileExists = await fs.access(niftiPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should apply window/level adjustment', async () => {
      const outputPath = path.join(testOutputDir, 'volume_windowed');
      
      const metadata = await extractVolume(testDicomDir, outputPath, {
        outputFormat: 'nifti',
        windowLevel: { width: 400, center: 40 },
      });

      expect(metadata).toBeDefined();
    });
  });

  describe('generateVolumePreviews', () => {
    it('should generate axial, sagittal, and coronal previews', async () => {
      // First extract a volume
      const volumePath = path.join(testOutputDir, 'volume_for_preview');
      await extractVolume(testDicomDir, volumePath, {
        outputFormat: 'nifti',
      });

      const previewDir = path.join(testOutputDir, 'previews');
      const previews = await generateVolumePreviews(
        volumePath + '.nii.gz',
        previewDir
      );

      expect(previews.axial).toBeDefined();
      expect(previews.sagittal).toBeDefined();
      expect(previews.coronal).toBeDefined();

      // Verify files exist
      const axialExists = await fs.access(previews.axial).then(() => true).catch(() => false);
      const sagittalExists = await fs.access(previews.sagittal).then(() => true).catch(() => false);
      const coronalExists = await fs.access(previews.coronal).then(() => true).catch(() => false);

      expect(axialExists).toBe(true);
      expect(sagittalExists).toBe(true);
      expect(coronalExists).toBe(true);

      // Verify files are PNG images
      const axialBuffer = await fs.readFile(previews.axial);
      expect(axialBuffer[0]).toBe(0x89); // PNG magic number
      expect(axialBuffer[1]).toBe(0x50);
      expect(axialBuffer[2]).toBe(0x4E);
      expect(axialBuffer[3]).toBe(0x47);
    });
  });

  describe('calculateVolumeStatistics', () => {
    it('should calculate volume statistics', async () => {
      // First extract a volume
      const volumePath = path.join(testOutputDir, 'volume_for_stats');
      await extractVolume(testDicomDir, volumePath, {
        outputFormat: 'nifti',
      });

      const stats = await calculateVolumeStatistics(volumePath + '.nii.gz');

      expect(stats).toBeDefined();
      expect(typeof stats.min).toBe('number');
      expect(typeof stats.max).toBe('number');
      expect(typeof stats.mean).toBe('number');
      expect(typeof stats.std).toBe('number');
      expect(typeof stats.median).toBe('number');
      expect(Array.isArray(stats.histogram)).toBe(true);
      expect(stats.histogram.length).toBe(256);
      
      // Verify statistical relationships
      expect(stats.min).toBeLessThanOrEqual(stats.mean);
      expect(stats.mean).toBeLessThanOrEqual(stats.max);
      expect(stats.std).toBeGreaterThanOrEqual(0);
    });
  });

  describe('segmentVolume', () => {
    it('should segment volume using threshold', async () => {
      // First extract a volume
      const volumePath = path.join(testOutputDir, 'volume_for_segment');
      await extractVolume(testDicomDir, volumePath, {
        outputFormat: 'nifti',
      });

      const segmentedPath = path.join(testOutputDir, 'segmented.nii.gz');
      await segmentVolume(
        volumePath + '.nii.gz',
        segmentedPath,
        50,  // lower threshold
        200  // upper threshold
      );

      // Verify segmented file exists
      const fileExists = await fs.access(segmentedPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file size
      const stats = await fs.stat(segmentedPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty DICOM directory', async () => {
      const emptyDir = await fs.mkdtemp(path.join('/tmp', 'empty-dicom-'));
      
      await expect(
        extractDicomMetadata(emptyDir)
      ).rejects.toThrow();

      await fs.rm(emptyDir, { recursive: true, force: true });
    });

    it('should handle invalid output format', async () => {
      const outputPath = path.join(testOutputDir, 'volume_invalid');
      
      // TypeScript should prevent this, but test runtime behavior
      await expect(
        extractVolume(testDicomDir, outputPath, {
          outputFormat: 'invalid' as any,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid target spacing', async () => {
      const outputPath = path.join(testOutputDir, 'volume_bad_spacing');
      
      await expect(
        extractVolume(testDicomDir, outputPath, {
          outputFormat: 'nifti',
          resample: true,
          targetSpacing: [-1, -1, -1], // Invalid negative spacing
        })
      ).rejects.toThrow();
    });
  });
});

/**
 * Generate synthetic DICOM series for testing
 */
async function generateSyntheticDicomSeries(
  outputDir: string,
  sliceCount: number
): Promise<void> {
  const pythonScript = `
import sys
import os
import numpy as np
import SimpleITK as sitk
from datetime import datetime

def generate_dicom_series(output_dir, slice_count):
    # Create synthetic 3D volume (simple gradient)
    size = [256, 256, slice_count]
    image = sitk.Image(size, sitk.sitkUInt16)
    
    # Fill with gradient pattern
    for z in range(slice_count):
        for y in range(size[1]):
            for x in range(size[0]):
                value = int((x + y + z * 10) % 4096)
                image.SetPixel([x, y, z], value)
    
    # Set metadata
    image.SetSpacing([1.0, 1.0, 2.0])
    image.SetOrigin([0.0, 0.0, 0.0])
    
    # Write as DICOM series
    writer = sitk.ImageFileWriter()
    writer.KeepOriginalImageUIDOn()
    
    series_tag_values = [
        ("0008|0031", datetime.now().strftime("%H%M%S")),  # Series Time
        ("0008|0021", datetime.now().strftime("%Y%m%d")),  # Series Date
        ("0008|0008", "DERIVED\\\\SECONDARY"),  # Image Type
        ("0020|000e", "1.2.826.0.1.3680043.2.1125." + datetime.now().strftime("%Y%m%d%H%M%S")),  # Series Instance UID
        ("0020|0037", "1\\\\0\\\\0\\\\0\\\\1\\\\0"),  # Image Orientation
        ("0010|0010", "Test^Patient"),  # Patient Name
        ("0010|0020", "TEST001"),  # Patient ID
        ("0008|0060", "CT"),  # Modality
    ]
    
    os.makedirs(output_dir, exist_ok=True)
    
    for i in range(slice_count):
        image_slice = image[:, :, i]
        
        # Set slice-specific tags
        for tag, value in series_tag_values:
            image_slice.SetMetaData(tag, value)
        
        image_slice.SetMetaData("0020|0032", f"0\\\\0\\\\{i * 2}")  # Image Position
        image_slice.SetMetaData("0020|0013", str(i))  # Instance Number
        
        filename = os.path.join(output_dir, f"slice_{i:04d}.dcm")
        writer.SetFileName(filename)
        writer.Execute(image_slice)

if __name__ == '__main__':
    output_dir = sys.argv[1]
    slice_count = int(sys.argv[2])
    generate_dicom_series(output_dir, slice_count)
`;

  const tempDir = await fs.mkdtemp(path.join('/tmp', 'gen-dicom-'));
  const scriptPath = path.join(tempDir, 'generate.py');
  await fs.writeFile(scriptPath, pythonScript);

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    await execAsync(`python3 "${scriptPath}" "${outputDir}" ${sliceCount}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
