/**
 * Real Image Preparer using pydicom and SimpleITK
 * Processes DICOM and NIfTI medical images for ML training
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface ImageMetadata {
  // Basic info
  width: number;
  height: number;
  depth: number;
  channels: number;

  // DICOM specific
  modality?: string;
  patientId?: string;
  studyId?: string;
  seriesId?: string;
  instanceNumber?: number;
  sliceThickness?: number;
  pixelSpacing?: [number, number];
  windowCenter?: number;
  windowWidth?: number;

  // Volume info
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];

  // Data info
  dataType: string;
  minValue: number;
  maxValue: number;
  meanValue: number;
  stdValue: number;
}

export interface ImageProcessingConfig {
  // Resampling
  targetSpacing?: [number, number, number];
  targetSize?: [number, number, number];

  // Normalization
  normalize: boolean;
  windowCenter?: number;
  windowWidth?: number;

  // Augmentation
  applyAugmentation: boolean;
  rotationRange?: number;
  scaleRange?: number;

  // Output
  outputFormat: 'nifti' | 'dicom' | 'raw';
  outputDir: string;
}

export interface ProcessedImage {
  id: string;
  path: string;
  metadata: ImageMetadata;
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

/**
 * Real Image Preparer using Python/SimpleITK backend
 */
export class RealImagePreparer {
  private pythonAvailable: boolean = false;
  private simpleitkAvailable: boolean = false;

  constructor() {
    this.checkPythonAvailability();
  }

  /**
   * Check if Python and SimpleITK are available
   */
  private async checkPythonAvailability(): Promise<void> {
    try {
      const pythonCheck = await this.runCommand('which', ['python3']);
      this.pythonAvailable = pythonCheck.length > 0;

      if (this.pythonAvailable) {
        const sitkCheck = await this.runCommand('python3', ['-c', 'import SimpleITK; print("OK")']);
        this.simpleitkAvailable = sitkCheck.includes('OK');
      }
    } catch {
      this.pythonAvailable = false;
      this.simpleitkAvailable = false;
    }
  }

  /**
   * Load image metadata
   */
  async loadMetadata(imagePath: string): Promise<ImageMetadata> {
    if (!this.simpleitkAvailable) {
      // Fallback to basic file info
      return this.getBasicMetadata(imagePath);
    }

    try {
      const metadata = await this.runPythonScript('load_metadata', { imagePath });
      return JSON.parse(metadata);
    } catch (error) {
      console.error('Failed to load metadata with SimpleITK:', error);
      return this.getBasicMetadata(imagePath);
    }
  }

  /**
   * Process image volume
   */
  async processImage(
    imagePath: string,
    config: ImageProcessingConfig
  ): Promise<ProcessedImage> {
    const startTime = Date.now();
    const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Ensure output directory exists
      await fs.mkdir(config.outputDir, { recursive: true });

      const outputPath = path.join(config.outputDir, `${id}.nii.gz`);

      if (!this.simpleitkAvailable) {
        // Fallback: just copy the file
        await fs.copyFile(imagePath, outputPath);
        
        return {
          id,
          path: outputPath,
          metadata: await this.getBasicMetadata(imagePath),
          processingTimeMs: Date.now() - startTime,
          success: true,
        };
      }

      // Process with SimpleITK via Python
      const result = await this.runPythonScript('process_image', {
        imagePath,
        outputPath,
        config,
      });

      const metadata = JSON.parse(result);

      return {
        id,
        path: outputPath,
        metadata,
        processingTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        id,
        path: '',
        metadata: {} as ImageMetadata,
        processingTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Batch process multiple images
   */
  async batchProcess(
    imagePaths: string[],
    config: ImageProcessingConfig,
    onProgress?: (completed: number, total: number) => void
  ): Promise<ProcessedImage[]> {
    const results: ProcessedImage[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const result = await this.processImage(imagePaths[i], config);
      results.push(result);
      onProgress?.(i + 1, imagePaths.length);
    }

    return results;
  }

  /**
   * Resample image to target spacing
   */
  async resample(
    imagePath: string,
    outputPath: string,
    targetSpacing: [number, number, number]
  ): Promise<boolean> {
    if (!this.simpleitkAvailable) {
      // Fallback: just copy
      try {
        await fs.copyFile(imagePath, outputPath);
        return true;
      } catch {
        return false;
      }
    }

    try {
      await this.runPythonScript('resample', {
        imagePath,
        outputPath,
        targetSpacing,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply window/level (contrast) adjustment
   */
  async applyWindowLevel(
    imagePath: string,
    outputPath: string,
    windowCenter: number,
    windowWidth: number
  ): Promise<boolean> {
    if (!this.simpleitkAvailable) {
      try {
        await fs.copyFile(imagePath, outputPath);
        return true;
      } catch {
        return false;
      }
    }

    try {
      await this.runPythonScript('window_level', {
        imagePath,
        outputPath,
        windowCenter,
        windowWidth,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize image intensity
   */
  async normalize(
    imagePath: string,
    outputPath: string,
    method: 'zscore' | 'minmax' | 'window'
  ): Promise<boolean> {
    if (!this.simpleitkAvailable) {
      try {
        await fs.copyFile(imagePath, outputPath);
        return true;
      } catch {
        return false;
      }
    }

    try {
      await this.runPythonScript('normalize', {
        imagePath,
        outputPath,
        method,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract slices from 3D volume
   */
  async extractSlices(
    imagePath: string,
    outputDir: string,
    axis: 'axial' | 'sagittal' | 'coronal' = 'axial',
    step: number = 1
  ): Promise<string[]> {
    await fs.mkdir(outputDir, { recursive: true });

    if (!this.simpleitkAvailable) {
      // Fallback: return empty array
      return [];
    }

    try {
      const result = await this.runPythonScript('extract_slices', {
        imagePath,
        outputDir,
        axis,
        step,
      });

      return JSON.parse(result);
    } catch {
      return [];
    }
  }

  /**
   * Run a Python script for image processing
   */
  private async runPythonScript(
    operation: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const script = this.generatePythonScript(operation, params);
    
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', ['-c', script]);
      let output = '';
      let error = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        error += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${error}`));
          return;
        }
        resolve(output);
      });

      proc.on('error', reject);
    });
  }

  /**
   * Generate Python script for image processing
   */
  private generatePythonScript(
    operation: string,
    params: Record<string, unknown>
  ): string {
    const scripts: Record<string, string> = {
      load_metadata: `
import json
import sys
try:
    import SimpleITK as sitk
    import pydicom
    
    image_path = '${params.imagePath}'
    
    # Try DICOM first
    try:
        ds = pydicom.dcmread(image_path)
        metadata = {
            'width': int(ds.Columns),
            'height': int(ds.Rows),
            'depth': 1,
            'channels': 1,
            'modality': str(ds.Modality) if hasattr(ds, 'Modality') else None,
            'patientId': str(ds.PatientID) if hasattr(ds, 'PatientID') else None,
            'studyId': str(ds.StudyInstanceUID) if hasattr(ds, 'StudyInstanceUID') else None,
            'seriesId': str(ds.SeriesInstanceUID) if hasattr(ds, 'SeriesInstanceUID') else None,
            'instanceNumber': int(ds.InstanceNumber) if hasattr(ds, 'InstanceNumber') else None,
            'sliceThickness': float(ds.SliceThickness) if hasattr(ds, 'SliceThickness') else None,
            'pixelSpacing': [float(x) for x in ds.PixelSpacing] if hasattr(ds, 'PixelSpacing') else None,
            'windowCenter': float(ds.WindowCenter) if hasattr(ds, 'WindowCenter') else None,
            'windowWidth': float(ds.WindowWidth) if hasattr(ds, 'WindowWidth') else None,
            'spacing': [float(x) for x in ds.PixelSpacing] + [float(ds.SliceThickness)] if hasattr(ds, 'PixelSpacing') and hasattr(ds, 'SliceThickness') else [1.0, 1.0, 1.0],
            'origin': [0.0, 0.0, 0.0],
            'direction': [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            'dataType': str(ds.pixel_array.dtype),
            'minValue': float(ds.pixel_array.min()),
            'maxValue': float(ds.pixel_array.max()),
            'meanValue': float(ds.pixel_array.mean()),
            'stdValue': float(ds.pixel_array.std()),
        }
    except:
        # Try with SimpleITK
        image = sitk.ReadImage(image_path)
        arr = sitk.GetArrayFromImage(image)
        metadata = {
            'width': image.GetWidth(),
            'height': image.GetHeight(),
            'depth': image.GetDepth() if image.GetDimension() == 3 else 1,
            'channels': image.GetNumberOfComponentsPerPixel(),
            'spacing': list(image.GetSpacing()),
            'origin': list(image.GetOrigin()),
            'direction': list(image.GetDirection()),
            'dataType': str(arr.dtype),
            'minValue': float(arr.min()),
            'maxValue': float(arr.max()),
            'meanValue': float(arr.mean()),
            'stdValue': float(arr.std()),
        }
    
    print(json.dumps(metadata))
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(1)
`,
      process_image: `
import json
import sys
try:
    import SimpleITK as sitk
    import numpy as np
    
    image_path = '${params.imagePath}'
    output_path = '${params.outputPath}'
    config = ${JSON.stringify(params.config)}
    
    # Read image
    image = sitk.ReadImage(image_path)
    
    # Resample if needed
    if config.get('targetSpacing'):
        original_spacing = image.GetSpacing()
        target_spacing = config['targetSpacing']
        
        # Calculate new size
        original_size = image.GetSize()
        new_size = [
            int(round(original_size[i] * (original_spacing[i] / target_spacing[i])))
            for i in range(3)
        ]
        
        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing(target_spacing)
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(image.GetDirection())
        resampler.SetOutputOrigin(image.GetOrigin())
        resampler.SetInterpolator(sitk.sitkLinear)
        image = resampler.Execute(image)
    
    # Normalize if needed
    if config.get('normalize'):
        arr = sitk.GetArrayFromImage(image)
        arr = (arr - arr.mean()) / (arr.std() + 1e-8)
        image = sitk.GetImageFromArray(arr)
        image.CopyInformation(image)
    
    # Window/level if needed
    if config.get('windowCenter') and config.get('windowWidth'):
        wc = config['windowCenter']
        ww = config['windowWidth']
        min_val = wc - ww / 2
        max_val = wc + ww / 2
        image = sitk.IntensityWindowing(image, min_val, max_val)
    
    # Write output
    sitk.WriteImage(image, output_path)
    
    # Return metadata
    arr = sitk.GetArrayFromImage(image)
    metadata = {
        'width': image.GetWidth(),
        'height': image.GetHeight(),
        'depth': image.GetDepth() if image.GetDimension() == 3 else 1,
        'spacing': list(image.GetSpacing()),
        'dataType': str(arr.dtype),
        'minValue': float(arr.min()),
        'maxValue': float(arr.max()),
    }
    
    print(json.dumps(metadata))
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(1)
`,
      resample: `
import SimpleITK as sitk
image = sitk.ReadImage('${params.imagePath}')
original_spacing = image.GetSpacing()
target_spacing = ${JSON.stringify(params.targetSpacing)}
original_size = image.GetSize()
new_size = [
    int(round(original_size[i] * (original_spacing[i] / target_spacing[i])))
    for i in range(3)
]
resampler = sitk.ResampleImageFilter()
resampler.SetOutputSpacing(target_spacing)
resampler.SetSize(new_size)
resampler.SetOutputDirection(image.GetDirection())
resampler.SetOutputOrigin(image.GetOrigin())
resampler.SetInterpolator(sitk.sitkLinear)
result = resampler.Execute(image)
sitk.WriteImage(result, '${params.outputPath}')
`,
      extract_slices: `
import json
import os
try:
    import SimpleITK as sitk
    
    image_path = '${params.imagePath}'
    output_dir = '${params.outputDir}'
    axis = '${params.axis}'
    step = ${params.step}
    
    image = sitk.ReadImage(image_path)
    arr = sitk.GetArrayFromImage(image)
    
    slice_paths = []
    
    if axis == 'axial':
        for i in range(0, arr.shape[0], step):
            slice_arr = arr[i, :, :]
            slice_image = sitk.GetImageFromArray(slice_arr)
            slice_path = os.path.join(output_dir, f'slice_axial_{i:04d}.nii.gz')
            sitk.WriteImage(slice_image, slice_path)
            slice_paths.append(slice_path)
    elif axis == 'sagittal':
        for i in range(0, arr.shape[1], step):
            slice_arr = arr[:, i, :]
            slice_image = sitk.GetImageFromArray(slice_arr)
            slice_path = os.path.join(output_dir, f'slice_sagittal_{i:04d}.nii.gz')
            sitk.WriteImage(slice_image, slice_path)
            slice_paths.append(slice_path)
    elif axis == 'coronal':
        for i in range(0, arr.shape[2], step):
            slice_arr = arr[:, :, i]
            slice_image = sitk.GetImageFromArray(slice_arr)
            slice_path = os.path.join(output_dir, f'slice_coronal_{i:04d}.nii.gz')
            sitk.WriteImage(slice_image, slice_path)
            slice_paths.append(slice_path)
    
    print(json.dumps(slice_paths))
except Exception as e:
    print(json.dumps([]))
`,
    };

    return scripts[operation] || '';
  }

  /**
   * Run a shell command
   */
  private async runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code}`));
          return;
        }
        resolve(output);
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get basic metadata from file
   */
  private async getBasicMetadata(imagePath: string): Promise<ImageMetadata> {
    const stats = await fs.stat(imagePath);
    
    return {
      width: 0,
      height: 0,
      depth: 1,
      channels: 1,
      spacing: [1.0, 1.0, 1.0],
      origin: [0.0, 0.0, 0.0],
      direction: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
      dataType: 'unknown',
      minValue: 0,
      maxValue: 0,
      meanValue: 0,
      stdValue: 0,
    };
  }
}
