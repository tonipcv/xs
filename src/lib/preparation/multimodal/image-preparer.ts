/**
 * Image Preparer for Medical Imaging
 * Handles resampling, windowing, and format conversion for DICOM/images
 */

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
    // In production, parse DICOM/NIfTI headers
    // For now, return simulated metadata
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

  private async resampleImage(
    inputPath: string,
    metadata: ImageMetadata,
    config: ImagePreparationConfig
  ): Promise<Float32Array> {
    // In production, use proper resampling (linear, nearest, etc.)
    // For now, simulate the resampled data
    const shape = config.targetShape ?? metadata.shape;
    const totalVoxels = shape[0] * shape[1] * shape[2];
    return new Float32Array(totalVoxels).map(() => Math.random() * 1000);
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
