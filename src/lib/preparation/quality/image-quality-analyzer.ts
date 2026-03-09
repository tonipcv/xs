/**
 * Image Quality Analyzer
 * Measures resolution, noise, blur, and other quality metrics for images
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';

export interface ImageQualityMetrics {
  // Basic metadata
  width: number;
  height: number;
  format: string;
  bitDepth: number;
  channels: number;

  // Quality metrics
  resolution: number;         // Megapixels
  minResolution: number;      // Min dimension
  blurScore: number;         // 0-1, higher is sharper
  noiseScore: number;        // 0-1, higher is less noisy
  contrastScore: number;     // 0-1, higher is better
  brightnessScore: number;   // 0-1, centered at 0.5
  compressionArtifacts: number; // 0-1, lower is better

  // Quality score (0-1)
  qualityScore: number;

  // Warnings
  warnings: string[];
}

export interface ImageQualityConfig {
  minWidth: number;         // Minimum width in pixels (default: 256)
  minHeight: number;          // Minimum height in pixels (default: 256)
  minResolution: number;      // Minimum resolution in MP (default: 0.5)
  maxBlur: number;            // Maximum blur score (default: 0.3)
  maxNoise: number;           // Maximum noise score (default: 0.3)
  acceptedFormats: string[];  // Accepted image formats
}

/**
 * Analyze image quality
 */
export class ImageQualityAnalyzer {
  private config: ImageQualityConfig;

  constructor(config?: Partial<ImageQualityConfig>) {
    this.config = {
      minWidth: 256,
      minHeight: 256,
      minResolution: 0.5,
      maxBlur: 0.3,
      maxNoise: 0.3,
      acceptedFormats: ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'dcm', 'nii', 'nii.gz'],
      ...config,
    };
  }

  /**
   * Analyze image file quality
   */
  async analyze(imagePath: string): Promise<ImageQualityMetrics> {
    // Check if ImageMagick is available
    const magickAvailable = await this.checkCommand('magick');
    const convertAvailable = await this.checkCommand('convert');
    const hasImageMagick = magickAvailable || convertAvailable;
    
    if (!hasImageMagick) {
      // Return basic metrics from file stats
      return this.getBasicMetrics(imagePath);
    }

    try {
      // Get image info
      const info = await this.getImageInfo(imagePath);
      
      // Calculate quality metrics
      const metrics: ImageQualityMetrics = {
        ...info,
        qualityScore: 0,
        warnings: [],
      };

      // Calculate quality score
      metrics.qualityScore = this.calculateQualityScore(metrics);
      
      // Generate warnings
      metrics.warnings = this.generateWarnings(metrics);

      return metrics;
    } catch (error) {
      console.error(`Failed to analyze ${imagePath}:`, error);
      return this.getErrorMetrics();
    }
  }

  /**
   * Batch analyze multiple images
   */
  async analyzeBatch(
    imagePaths: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, ImageQualityMetrics>> {
    const results = new Map<string, ImageQualityMetrics>();

    for (let i = 0; i < imagePaths.length; i++) {
      const path = imagePaths[i];
      try {
        const metrics = await this.analyze(path);
        results.set(path, metrics);
      } catch (error) {
        console.error(`Failed to analyze ${path}:`, error);
        results.set(path, this.getErrorMetrics());
      }
      onProgress?.(i + 1, imagePaths.length);
    }

    return results;
  }

  /**
   * Generate quality report for batch analysis
   */
  generateReport(results: Map<string, ImageQualityMetrics>): {
    totalFiles: number;
    passedCount: number;
    failedCount: number;
    averageResolution: number;
    averageQualityScore: number;
    formatDistribution: Record<string, number>;
    resolutionDistribution: {
      low: number;    // < 1MP
      medium: number; // 1-4MP
      high: number;   // > 4MP
    };
    commonIssues: string[];
  } {
    let passedCount = 0;
    let failedCount = 0;
    let totalResolution = 0;
    let totalQualityScore = 0;
    const formatDistribution: Record<string, number> = {};
    const resolutionDistribution = { low: 0, medium: 0, high: 0 };
    const issueCounts: Record<string, number> = {};

    for (const metrics of results.values()) {
      if (metrics.qualityScore >= 0.7) {
        passedCount++;
      } else {
        failedCount++;
      }

      totalResolution += metrics.resolution;
      totalQualityScore += metrics.qualityScore;

      // Format distribution
      formatDistribution[metrics.format] = (formatDistribution[metrics.format] || 0) + 1;

      // Resolution distribution
      if (metrics.resolution < 1) {
        resolutionDistribution.low++;
      } else if (metrics.resolution < 4) {
        resolutionDistribution.medium++;
      } else {
        resolutionDistribution.high++;
      }

      // Count issues
      for (const warning of metrics.warnings) {
        issueCounts[warning] = (issueCounts[warning] || 0) + 1;
      }
    }

    const totalFiles = results.size;

    // Get top 5 common issues
    const sortedIssues = Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);

    return {
      totalFiles,
      passedCount,
      failedCount,
      averageResolution: totalFiles > 0 ? totalResolution / totalFiles : 0,
      averageQualityScore: totalFiles > 0 ? totalQualityScore / totalFiles : 0,
      formatDistribution,
      resolutionDistribution,
      commonIssues: sortedIssues,
    };
  }

  /**
   * Check if image meets quality requirements
   */
  validate(imagePath: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.analyze(imagePath).then((metrics) => {
      const errors: string[] = [];

      if (metrics.width < this.config.minWidth) {
        errors.push(`Width ${metrics.width}px below minimum ${this.config.minWidth}px`);
      }

      if (metrics.height < this.config.minHeight) {
        errors.push(`Height ${metrics.height}px below minimum ${this.config.minHeight}px`);
      }

      if (metrics.resolution < this.config.minResolution) {
        errors.push(`Resolution ${metrics.resolution.toFixed(2)}MP below minimum ${this.config.minResolution}MP`);
      }

      if (metrics.blurScore > this.config.maxBlur) {
        errors.push(`Image too blurry (score: ${metrics.blurScore.toFixed(2)})`);
      }

      if (metrics.noiseScore > this.config.maxNoise) {
        errors.push(`Image too noisy (score: ${metrics.noiseScore.toFixed(2)})`);
      }

      if (!this.config.acceptedFormats.includes(metrics.format.toLowerCase())) {
        errors.push(`Format ${metrics.format} not accepted`);
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    });
  }

  /**
   * Check if a command is available
   */
  private async checkCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', [command]);
      proc.on('exit', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Get image info using ImageMagick
   */
  private async getImageInfo(imagePath: string): Promise<{
    width: number;
    height: number;
    format: string;
    bitDepth: number;
    channels: number;
    resolution: number;
    minResolution: number;
    blurScore: number;
    noiseScore: number;
    contrastScore: number;
    brightnessScore: number;
    compressionArtifacts: number;
  }> {
    // Get basic info
    const info = await this.runImageMagickIdentify(imagePath);
    
    // Estimate quality metrics from histogram
    const histogram = await this.runImageMagickHistogram(imagePath);

    return {
      ...info,
      ...histogram,
    };
  }

  /**
   * Run ImageMagick identify
   */
  private async runImageMagickIdentify(imagePath: string): Promise<{
    width: number;
    height: number;
    format: string;
    bitDepth: number;
    channels: number;
    resolution: number;
    minResolution: number;
  }> {
    return new Promise((resolve, reject) => {
      const command = 'magick';
      const args = ['identify', '-verbose', imagePath];

      const proc = spawn(command, args);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          // Try with convert command
          const proc2 = spawn('identify', [imagePath]);
          let output2 = '';

          proc2.stdout.on('data', (data) => {
            output2 += data.toString();
          });

          proc2.on('exit', (code2) => {
            if (code2 !== 0) {
              reject(new Error('ImageMagick not available'));
              return;
            }
            resolve(this.parseIdentifyOutput(output2));
          });
          return;
        }

        resolve(this.parseIdentifyOutput(output));
      });

      proc.on('error', () => {
        // Try with convert command
        const proc2 = spawn('identify', [imagePath]);
        let output2 = '';

        proc2.stdout.on('data', (data) => {
          output2 += data.toString();
        });

        proc2.on('exit', (code2) => {
          if (code2 !== 0) {
            reject(new Error('ImageMagick not available'));
            return;
          }
          resolve(this.parseIdentifyOutput(output2));
        });
      });
    });
  }

  /**
   * Parse ImageMagick identify output
   */
  private parseIdentifyOutput(output: string): {
    width: number;
    height: number;
    format: string;
    bitDepth: number;
    channels: number;
    resolution: number;
    minResolution: number;
  } {
    // Parse basic format: image.jpg JPEG 1920x1080 1920x1080+0+0 8-bit sRGB 2.2MiB 0.000u 0:00:00
    const lines = output.split('\n');
    const firstLine = lines[0] || '';

    // Try to parse from first line
    const match = firstLine.match(/(\d+)x(\d+)/);
    let width = 0;
    let height = 0;

    if (match) {
      width = parseInt(match[1]);
      height = parseInt(match[2]);
    }

    // Extract format
    const formatMatch = firstLine.match(/\s([A-Z]+)\s/);
    let format = 'unknown';
    if (formatMatch) {
      format = formatMatch[1].toLowerCase();
    }

    // Extract bit depth
    const depthMatch = output.match(/(\d+)-bit/);
    let bitDepth = 8;
    if (depthMatch) {
      bitDepth = parseInt(depthMatch[1]);
    }

    // Extract channels
    const channelsMatch = output.match(/(\d+)\s*channel/);
    let channels = 3;
    if (channelsMatch) {
      channels = parseInt(channelsMatch[1]);
    } else if (output.includes('grayscale') || output.includes('gray')) {
      channels = 1;
    }

    const resolution = (width * height) / 1000000;
    const minResolution = Math.min(width, height);

    return {
      width,
      height,
      format,
      bitDepth,
      channels,
      resolution,
      minResolution,
    };
  }

  /**
   * Run ImageMagick to get histogram-based quality metrics
   */
  private async runImageMagickHistogram(imagePath: string): Promise<{
    blurScore: number;
    noiseScore: number;
    contrastScore: number;
    brightnessScore: number;
    compressionArtifacts: number;
  }> {
    return new Promise((resolve) => {
      // Use identify with verbose output to get more info
      const proc = spawn('magick', ['identify', '-verbose', imagePath]);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', () => {
        resolve(this.estimateQualityFromStats(output));
      });

      proc.on('error', () => {
        resolve(this.estimateQualityFromStats(''));
      });
    });
  }

  /**
   * Estimate quality metrics from verbose output
   */
  private estimateQualityFromStats(output: string): {
    blurScore: number;
    noiseScore: number;
    contrastScore: number;
    brightnessScore: number;
    compressionArtifacts: number;
  } {
    // Default values
    let blurScore = 0.5;
    let noiseScore = 0.5;
    let contrastScore = 0.5;
    let brightnessScore = 0.5;
    let compressionArtifacts = 0.5;

    // Try to extract some stats from output
    const meanMatch = output.match(/Mean:\s*([\d.]+)/);
    const stdDevMatch = output.match(/standard deviation:\s*([\d.]+)/);

    if (meanMatch && stdDevMatch) {
      const mean = parseFloat(meanMatch[1]);
      const stdDev = parseFloat(stdDevMatch[1]);

      // Brightness score centered at 0.5
      brightnessScore = Math.max(0, Math.min(1, mean / 65535));

      // Contrast score from standard deviation
      contrastScore = Math.max(0, Math.min(1, stdDev / 32768));

      // Blur score (higher stdDev = sharper)
      blurScore = Math.max(0, Math.min(1, 1 - (stdDev / 65535)));

      // Noise score (very high or very low stdDev can indicate noise)
      noiseScore = stdDev > 5000 && stdDev < 30000 ? 0.7 : 0.3;
    }

    // Check for JPEG compression
    if (output.includes('JPEG') || output.includes('jpeg')) {
      compressionArtifacts = 0.4; // Slightly lower for JPEG
    }

    return {
      blurScore,
      noiseScore,
      contrastScore,
      brightnessScore,
      compressionArtifacts,
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(metrics: ImageQualityMetrics): number {
    let score = 1.0;

    // Resolution penalty
    if (metrics.resolution < this.config.minResolution) {
      score -= (this.config.minResolution - metrics.resolution) / this.config.minResolution * 0.3;
    }

    // Size penalty
    if (metrics.minResolution < Math.min(this.config.minWidth, this.config.minHeight)) {
      score -= 0.3;
    }

    // Blur penalty
    if (metrics.blurScore > this.config.maxBlur) {
      score -= (metrics.blurScore - this.config.maxBlur) / (1 - this.config.maxBlur) * 0.2;
    }

    // Noise penalty
    if (metrics.noiseScore > this.config.maxNoise) {
      score -= (metrics.noiseScore - this.config.maxNoise) / (1 - this.config.maxNoise) * 0.2;
    }

    // Compression artifacts penalty
    score -= metrics.compressionArtifacts * 0.1;

    // Bit depth bonus
    if (metrics.bitDepth >= 16) {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate warnings based on metrics
   */
  private generateWarnings(metrics: ImageQualityMetrics): string[] {
    const warnings: string[] = [];

    if (metrics.width < this.config.minWidth) {
      warnings.push(`Low width: ${metrics.width}px (min: ${this.config.minWidth}px)`);
    }

    if (metrics.height < this.config.minHeight) {
      warnings.push(`Low height: ${metrics.height}px (min: ${this.config.minHeight}px)`);
    }

    if (metrics.blurScore > this.config.maxBlur) {
      warnings.push(`Image appears blurry (score: ${metrics.blurScore.toFixed(2)})`);
    }

    if (metrics.noiseScore > this.config.maxNoise) {
      warnings.push(`High noise detected (score: ${metrics.noiseScore.toFixed(2)})`);
    }

    if (metrics.compressionArtifacts > 0.5) {
      warnings.push('Heavy compression artifacts detected');
    }

    if (metrics.brightnessScore < 0.2 || metrics.brightnessScore > 0.8) {
      warnings.push('Unusual brightness level');
    }

    if (metrics.contrastScore < 0.3) {
      warnings.push('Low contrast detected');
    }

    return warnings;
  }

  /**
   * Get basic metrics when ImageMagick is not available
   */
  private async getBasicMetrics(imagePath: string): Promise<ImageQualityMetrics> {
    const stats = await fs.stat(imagePath);
    const format = imagePath.split('.').pop() || 'unknown';

    return {
      width: 0,
      height: 0,
      format,
      bitDepth: 8,
      channels: 3,
      resolution: 0,
      minResolution: 0,
      blurScore: 0.5,
      noiseScore: 0.5,
      contrastScore: 0.5,
      brightnessScore: 0.5,
      compressionArtifacts: 0.5,
      qualityScore: 0.5,
      warnings: ['ImageMagick not available, using default metrics'],
    };
  }

  /**
   * Get error metrics for failed analysis
   */
  private getErrorMetrics(): ImageQualityMetrics {
    return {
      width: 0,
      height: 0,
      format: 'error',
      bitDepth: 0,
      channels: 0,
      resolution: 0,
      minResolution: 0,
      blurScore: 1,
      noiseScore: 1,
      contrastScore: 0,
      brightnessScore: 0,
      compressionArtifacts: 1,
      qualityScore: 0,
      warnings: ['Failed to analyze image'],
    };
  }
}
