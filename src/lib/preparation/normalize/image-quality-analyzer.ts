/**
 * Image Quality Metrics
 * Resolution validation, sharpness, contrast detection
 */

export interface ImageQualityMetrics {
  width: number;
  height: number;
  resolution: number; // total pixels
  aspectRatio: number;
  bitsPerPixel: number;
  estimatedSharpness: number;
  estimatedContrast: number;
  qualityScore: number;
}

export interface ImageQualityConfig {
  minWidth?: number;
  minHeight?: number;
  minResolution?: number;
  maxAspectRatio?: number;
  minBitsPerPixel?: number;
}

export class ImageQualityAnalyzer {
  private config: ImageQualityConfig;

  constructor(config?: ImageQualityConfig) {
    this.config = {
      minWidth: 256,
      minHeight: 256,
      minResolution: 65536, // 256x256
      maxAspectRatio: 4.0,
      minBitsPerPixel: 8,
      ...config,
    };
  }

  /**
   * Analyze image quality from metadata
   */
  analyzeFromMetadata(metadata: {
    width: number;
    height: number;
    bitsAllocated?: number;
    bitsStored?: number;
    highBit?: number;
  }): ImageQualityMetrics {
    const width = metadata.width;
    const height = metadata.height;
    const resolution = width * height;
    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    
    // Estimate bits per pixel
    const bitsPerPixel = metadata.bitsAllocated || metadata.bitsStored || 8;
    
    // Estimate sharpness (would need actual image analysis)
    // For now, estimate based on resolution
    const estimatedSharpness = this.estimateSharpness(resolution);
    
    // Estimate contrast
    const estimatedContrast = this.estimateContrast(bitsPerPixel);
    
    // Calculate quality score
    const qualityScore = this.calculateQualityScore({
      width,
      height,
      resolution,
      aspectRatio,
      bitsPerPixel,
    });

    return {
      width,
      height,
      resolution,
      aspectRatio,
      bitsPerPixel,
      estimatedSharpness,
      estimatedContrast,
      qualityScore,
    };
  }

  private estimateSharpness(resolution: number): number {
    // Higher resolution generally means sharper images
    // But diminishing returns after certain point
    if (resolution > 1000000) return 90; // 1MP+
    if (resolution > 500000) return 80;  // 0.5MP+
    if (resolution > 250000) return 70;  // 0.25MP+
    if (resolution > 100000) return 60;
    if (resolution > 50000) return 50;
    return 40;
  }

  private estimateContrast(bitsPerPixel: number): number {
    // More bits = more contrast levels
    if (bitsPerPixel >= 16) return 95;
    if (bitsPerPixel >= 12) return 85;
    if (bitsPerPixel >= 10) return 75;
    if (bitsPerPixel >= 8) return 65;
    return 50;
  }

  private calculateQualityScore(metrics: {
    width: number;
    height: number;
    resolution: number;
    aspectRatio: number;
    bitsPerPixel: number;
  }): number {
    let score = 100;
    
    // Penalty for low resolution
    if (metrics.width < (this.config.minWidth || 256)) {
      score -= 20;
    }
    if (metrics.height < (this.config.minHeight || 256)) {
      score -= 20;
    }
    if (metrics.resolution < (this.config.minResolution || 65536)) {
      score -= 15;
    }
    
    // Penalty for extreme aspect ratio
    if (metrics.aspectRatio > (this.config.maxAspectRatio || 4.0)) {
      score -= 10;
    }
    
    // Penalty for low bit depth
    if (metrics.bitsPerPixel < (this.config.minBitsPerPixel || 8)) {
      score -= 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Validate image quality against thresholds
   */
  validateQuality(metrics: ImageQualityMetrics): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (metrics.width < (this.config.minWidth || 256)) {
      issues.push(`Width too small: ${metrics.width}px (min: ${this.config.minWidth})`);
    }
    
    if (metrics.height < (this.config.minHeight || 256)) {
      issues.push(`Height too small: ${metrics.height}px (min: ${this.config.minHeight})`);
    }
    
    if (metrics.resolution < (this.config.minResolution || 65536)) {
      issues.push(`Resolution too low: ${metrics.resolution} pixels`);
    }
    
    if (metrics.aspectRatio > (this.config.maxAspectRatio || 4.0)) {
      issues.push(`Aspect ratio too extreme: ${metrics.aspectRatio.toFixed(2)}`);
    }
    
    if (metrics.bitsPerPixel < (this.config.minBitsPerPixel || 8)) {
      issues.push(`Bit depth too low: ${metrics.bitsPerPixel}-bit`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get quality grade from score
   */
  getGrade(score: number): 'excellent' | 'good' | 'acceptable' | 'poor' | 'rejected' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'acceptable';
    if (score >= 40) return 'poor';
    return 'rejected';
  }
}

export default ImageQualityAnalyzer;
