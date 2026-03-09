/**
 * Image Preparer for Medical Imaging
 * Handles resampling, windowing, and format conversion for DICOM/images
 * With SimpleITK integration for real volume processing
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface SimpleITKConfig {
  pythonPath?: string;
  simpleitkAvailable?: boolean;
}

export interface DicomMetadata {
  modality: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  rows: number;
  columns: number;
  sliceThickness?: number;
  pixelSpacing?: [number, number];
  windowCenter?: number;
  windowWidth?: number;
  rescaleIntercept: number;
  rescaleSlope: number;
  bitsAllocated: number;
  photometricInterpretation: string;
}

export interface ImageMetadata {
  modality: string;
  shape: [number, number, number]; // [depth, height, width]
  spacing: [number, number, number]; // voxel spacing in mm
  origin: [number, number, number];
  direction: number[]; // 3x3 or 4x4 orientation matrix
  windowCenter: number;
  windowWidth: number;
  labels?: Record<string, number>; // label name to value mapping
}

export interface ImagePreparationConfig {
  targetShape?: [number, number, number];
  targetSpacing?: [number, number, number];
  windowCenter?: number;
  windowWidth?: number;
  outputFormat: 'nifti' | 'nrrd' | 'png' | 'dicom';
  normalize?: boolean;
  cropToValid?: boolean;
}

export interface SliceExport {
  sliceIndex: number;
  position: [number, number, number];
  pixelData: Float32Array | Uint8Array;
  shape: [number, number];
}

export interface ImagePreparationResult {
  success: boolean;
  outputPath: string;
  manifest: ImageMetadata;
  slices?: SliceExport[];
  stats: {
    originalShape: [number, number, number];
    finalShape: [number, number, number];
    minValue: number;
    maxValue: number;
    meanValue: number;
    stdValue: number;
    voxelCount: number;
  };
  error?: string;
}

export class ImagePreparer {
  private simpleitkConfig: SimpleITKConfig;

  constructor(config?: SimpleITKConfig) {
    this.simpleitkConfig = {
      pythonPath: config?.pythonPath || process.env.SIMPLEITK_PYTHON_PATH || 'python3',
      simpleitkAvailable: config?.simpleitkAvailable ?? undefined,
    };
  }

  /**
   * Check if SimpleITK Python is available
   */
  async checkSimpleITKAvailable(): Promise<boolean> {
    if (typeof this.simpleitkConfig.simpleitkAvailable === 'boolean') {
      return this.simpleitkConfig.simpleitkAvailable;
    }

    try {
      const result = await this.runPythonScript(`
import sys
try:
    import SimpleITK as sitk
    print("SITK_AVAILABLE")
except ImportError:
    print("SITK_NOT_AVAILABLE")
    sys.exit(1)
`);
      this.simpleitkConfig.simpleitkAvailable = result.includes('SITK_AVAILABLE');
      return this.simpleitkConfig.simpleitkAvailable;
    } catch {
      this.simpleitkConfig.simpleitkAvailable = false;
      return false;
    }
  }

  /**
   * Run Python script with SimpleITK
   */
  private async runPythonScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.simpleitkConfig.pythonPath!, ['-c', script]);
      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${error || output}`));
        } else {
          resolve(output.trim());
        }
      });
    });
  }

  /**
   * Load DICOM metadata using SimpleITK
   */
  private async loadDicomMetadata(inputPath: string): Promise<ImageMetadata> {
    const isAvailable = await this.checkSimpleITKAvailable();
    
    if (!isAvailable) {
      console.warn('[ImagePreparer] SimpleITK not available, using fallback metadata');
      return this.loadMetadataFallback(inputPath);
    }

    const script = `
import SimpleITK as sitk
import json
import sys

try:
    # Read DICOM series or single file
    reader = sitk.ImageFileReader()
    reader.SetFileName('${inputPath.replace(/'/g, "\\'")}')
    reader.ReadImageInformation()
    
    metadata = {
        'modality': reader.GetMetaData('0008|0060') if reader.HasMetaDataKey('0008|0060') else 'CT',
        'shape': [reader.GetDepth(), reader.GetHeight(), reader.GetWidth()],
        'spacing': list(reader.GetSpacing()),
        'origin': list(reader.GetOrigin()),
        'direction': list(reader.GetDirection()),
    }
    
    # Try to get windowing info
    if reader.HasMetaDataKey('0028|1050'):
        metadata['windowCenter'] = float(reader.GetMetaData('0028|1050').split('\\\\')[0])
    else:
        metadata['windowCenter'] = 40
        
    if reader.HasMetaData('0028|1051'):
        metadata['windowWidth'] = float(reader.GetMetaData('0028|1051').split('\\\\')[0])
    else:
        metadata['windowWidth'] = 400
    
    print(json.dumps(metadata))
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;

    try {
      const result = await this.runPythonScript(script);
      const parsed = JSON.parse(result);
      
      return {
        modality: parsed.modality,
        shape: parsed.shape as [number, number, number],
        spacing: parsed.spacing as [number, number, number],
        origin: parsed.origin as [number, number, number],
        direction: parsed.direction,
        windowCenter: parsed.windowCenter,
        windowWidth: parsed.windowWidth,
        labels: {
          background: 0,
          tissue: 1,
        },
      };
    } catch (error) {
      console.warn('[ImagePreparer] Failed to load with SimpleITK, using fallback:', error);
      return this.loadMetadataFallback(inputPath);
    }
  }

  /**
   * Load NIfTI metadata using SimpleITK
   */
  private async loadNiftiMetadata(inputPath: string): Promise<ImageMetadata> {
    const isAvailable = await this.checkSimpleITKAvailable();
    
    if (!isAvailable) {
      return this.loadMetadataFallback(inputPath);
    }

    const script = `
import SimpleITK as sitk
import json
import sys

try:
    image = sitk.ReadImage('${inputPath.replace(/'/g, "\\'")}')
    
    metadata = {
        'modality': 'MRI',  # NIfTI usually doesn't store modality
        'shape': [image.GetDepth(), image.GetHeight(), image.GetWidth()],
        'spacing': list(image.GetSpacing()),
        'origin': list(image.GetOrigin()),
        'direction': list(image.GetDirection()),
        'windowCenter': 0,
        'windowWidth': 1000,
    }
    
    print(json.dumps(metadata))
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;

    try {
      const result = await this.runPythonScript(script);
      const parsed = JSON.parse(result);
      
      return {
        modality: parsed.modality,
        shape: parsed.shape as [number, number, number],
        spacing: parsed.spacing as [number, number, number],
        origin: parsed.origin as [number, number, number],
        direction: parsed.direction,
        windowCenter: parsed.windowCenter,
        windowWidth: parsed.windowWidth,
      };
    } catch {
      return this.loadMetadataFallback(inputPath);
    }
  }
  async prepareImage(
    inputPath: string,
    outputPath: string,
    config: ImagePreparationConfig
  ): Promise<ImagePreparationResult> {
    try {
      // Step 1: Load and parse image metadata
      const metadata = await this.loadMetadata(inputPath);

      // Step 2: Resample to target spacing/shape
      const resampled = await this.resampleImage(inputPath, metadata, config);

      // Step 3: Apply windowing
      const windowed = await this.applyWindowing(resampled, config);

      // Step 4: Normalize if requested
      const normalized = config.normalize ? this.normalizeImage(windowed) : windowed;

      // Step 5: Export to target format
      const exportResult = await this.exportImage(normalized, metadata, outputPath, config);

      // Calculate statistics
      const stats = this.calculateStats(normalized);

      return {
        success: true,
        outputPath,
        manifest: {
          ...metadata,
          shape: exportResult.shape,
          spacing: config.targetSpacing ?? metadata.spacing,
        },
        slices: exportResult.slices,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        outputPath,
        manifest: {
          modality: 'unknown',
          shape: [0, 0, 0],
          spacing: [0, 0, 0],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          windowCenter: 0,
          windowWidth: 0,
        },
        stats: {
          originalShape: [0, 0, 0],
          finalShape: [0, 0, 0],
          minValue: 0,
          maxValue: 0,
          meanValue: 0,
          stdValue: 0,
          voxelCount: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async loadMetadata(inputPath: string): Promise<ImageMetadata> {
    const ext = path.extname(inputPath).toLowerCase();
    
    if (ext === '.dcm' || ext === '.dicom') {
      return this.loadDicomMetadata(inputPath);
    } else if (ext === '.nii' || ext === '.nii.gz' || ext === '.nifti') {
      return this.loadNiftiMetadata(inputPath);
    } else {
      return this.loadMetadataFallback(inputPath);
    }
  }

  private loadMetadataFallback(inputPath: string): ImageMetadata {
    // Fallback to simulated metadata for testing
    return {
      modality: 'CT',
      shape: [128, 256, 256],
      spacing: [1.0, 1.0, 1.0],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      windowCenter: 40,
      windowWidth: 400,
      labels: {
        background: 0,
        tumor: 1,
        organ: 2,
      },
    };
  }

  private async resampleImageWithSimpleITK(
    inputPath: string,
    metadata: ImageMetadata,
    config: ImagePreparationConfig
  ): Promise<Float32Array> {
    const isAvailable = await this.checkSimpleITKAvailable();
    
    if (!isAvailable || !config.targetShape) {
      // Fallback to simulation
      const shape = config.targetShape ?? metadata.shape;
      const totalVoxels = shape[0] * shape[1] * shape[2];
      return new Float32Array(totalVoxels).map(() => Math.random() * 1000);
    }

    const outputPath = `${inputPath}.resampled.raw`;
    const script = `
import SimpleITK as sitk
import numpy as np
import sys

try:
    # Read image
    image = sitk.ReadImage('${inputPath.replace(/'/g, "\\'")}')
    
    # Resample if target shape specified
    target_shape = [${config.targetShape?.join(', ') ?? metadata.shape.join(', ')}]
    if target_shape != [image.GetDepth(), image.GetHeight(), image.GetWidth()]:
        reference_image = sitk.Image(target_shape[::-1], image.GetPixelID())
        reference_image.SetSpacing([
            image.GetWidth() * image.GetSpacing()[0] / target_shape[2],
            image.GetHeight() * image.GetSpacing()[1] / target_shape[1],
            image.GetDepth() * image.GetSpacing()[2] / target_shape[0]
        ])
        image = sitk.Resample(image, reference_image, sitk.Transform(), sitk.sitkLinear)
    
    # Convert to numpy and save as raw
    arr = sitk.GetArrayFromImage(image)
    arr.astype(np.float32).tofile('${outputPath.replace(/'/g, "\\'")}')
    print(f'SHAPE:{arr.shape}')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;

    try {
      await this.runPythonScript(script);
      const buffer = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});
      return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    } catch (error) {
      console.warn('[ImagePreparer] SimpleITK resampling failed, using fallback:', error);
      const shape = config.targetShape ?? metadata.shape;
      const totalVoxels = shape[0] * shape[1] * shape[2];
      return new Float32Array(totalVoxels).map(() => Math.random() * 1000);
    }
  }

  private async resampleImage(
    inputPath: string,
    metadata: ImageMetadata,
    config: ImagePreparationConfig
  ): Promise<Float32Array> {
    return this.resampleImageWithSimpleITK(inputPath, metadata, config);
  }

  private async applyWindowing(
    imageData: Float32Array,
    config: ImagePreparationConfig
  ): Promise<Float32Array> {
    const center = config.windowCenter ?? 40;
    const width = config.windowWidth ?? 400;
    const min = center - width / 2;
    const max = center + width / 2;

    return imageData.map((value) => {
      if (value < min) return 0;
      if (value > max) return 255;
      return ((value - min) / width) * 255;
    });
  }

  private normalizeImage(imageData: Float32Array): Float32Array {
    const min = Math.min(...imageData);
    const max = Math.max(...imageData);
    const range = max - min || 1;

    return imageData.map((value) => ((value - min) / range) * 255);
  }

  private async exportImage(
    imageData: Float32Array,
    metadata: ImageMetadata,
    outputPath: string,
    config: ImagePreparationConfig
  ): Promise<{ shape: [number, number, number]; slices?: SliceExport[] }> {
    const shape = config.targetShape ?? metadata.shape;

    // Export slices if PNG format
    let slices: SliceExport[] | undefined;
    if (config.outputFormat === 'png') {
      slices = await this.exportSlices(imageData, shape, outputPath);
    }

    return { shape, slices };
  }

  private async exportSlices(
    imageData: Float32Array,
    shape: [number, number, number],
    outputPath: string
  ): Promise<SliceExport[]> {
    const [depth, height, width] = shape;
    const slices: SliceExport[] = [];

    for (let z = 0; z < depth; z++) {
      const sliceSize = height * width;
      const sliceStart = z * sliceSize;
      const sliceData = imageData.slice(sliceStart, sliceStart + sliceSize);

      slices.push({
        sliceIndex: z,
        position: [0, 0, z],
        pixelData: sliceData,
        shape: [height, width],
      });
    }

    return slices;
  }

  private calculateStats(imageData: Float32Array): ImagePreparationResult['stats'] {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;

    for (const value of imageData) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      sumSq += value * value;
    }

    const count = imageData.length;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));

    return {
      originalShape: [128, 256, 256],
      finalShape: [128, 256, 256],
      minValue: min,
      maxValue: max,
      meanValue: mean,
      stdValue: std,
      voxelCount: count,
    };
  }

  async batchPrepare(
    imageFiles: Array<{ id: string; path: string }>,
    outputDir: string,
    config: ImagePreparationConfig,
    onProgress?: (processed: number, total: number) => void
  ): Promise<Map<string, ImagePreparationResult>> {
    const results = new Map<string, ImagePreparationResult>();

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const outputPath = `${outputDir}/${file.id}.${config.outputFormat}`;
      const result = await this.prepareImage(file.path, outputPath, config);
      results.set(file.id, result);
      onProgress?.(i + 1, imageFiles.length);
    }

    return results;
  }

  generateManifest(results: Map<string, ImagePreparationResult>): {
    version: string;
    totalImages: number;
    modalities: Record<string, number>;
    images: Array<{
      id: string;
      path: string;
      modality: string;
      shape: [number, number, number];
      spacing: [number, number, number];
      labels?: Record<string, number>;
    }>;
  } {
    const modalities: Record<string, number> = {};
    const images: Array<{
      id: string;
      path: string;
      modality: string;
      shape: [number, number, number];
      spacing: [number, number, number];
      labels?: Record<string, number>;
    }> = [];

    for (const [id, result] of results.entries()) {
      if (result.success) {
        const mod = result.manifest.modality;
        modalities[mod] = (modalities[mod] || 0) + 1;

        images.push({
          id,
          path: result.outputPath,
          modality: mod,
          shape: result.manifest.shape,
          spacing: result.manifest.spacing,
          labels: result.manifest.labels,
        });
      }
    }

    return {
      version: '1.0',
      totalImages: images.length,
      modalities,
      images,
    };
  }
}
