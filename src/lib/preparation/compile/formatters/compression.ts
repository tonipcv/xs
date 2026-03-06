/**
 * Compression utilities for output files
 * Supports gzip compression for JSONL and other text formats
 */

import { createGzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import fs from 'fs/promises';

export type CompressionType = 'none' | 'gzip';

export class CompressionHelper {
  /**
   * Compress a file using gzip
   */
  async compressFile(inputPath: string, outputPath?: string): Promise<string> {
    const output = outputPath || `${inputPath}.gz`;
    
    const source = createReadStream(inputPath);
    const destination = createWriteStream(output);
    const gzip = createGzip();

    await pipeline(source, gzip, destination);

    return output;
  }

  /**
   * Compress multiple files
   */
  async compressFiles(inputPaths: string[]): Promise<string[]> {
    const compressedPaths: string[] = [];

    for (const inputPath of inputPaths) {
      const compressed = await this.compressFile(inputPath);
      compressedPaths.push(compressed);
    }

    return compressedPaths;
  }

  /**
   * Get compressed file size
   */
  async getCompressedSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Calculate compression ratio
   */
  async getCompressionRatio(originalPath: string, compressedPath: string): Promise<number> {
    const originalStats = await fs.stat(originalPath);
    const compressedStats = await fs.stat(compressedPath);

    return compressedStats.size / originalStats.size;
  }

  /**
   * Compress and replace original file
   */
  async compressInPlace(filePath: string): Promise<void> {
    const compressedPath = await this.compressFile(filePath);
    
    // Delete original file
    await fs.unlink(filePath);
    
    // Rename compressed file to original name
    await fs.rename(compressedPath, filePath);
  }

  /**
   * Check if compression is beneficial
   */
  async shouldCompress(filePath: string, minRatio: number = 0.8): Promise<boolean> {
    const tempCompressed = `${filePath}.temp.gz`;
    
    try {
      await this.compressFile(filePath, tempCompressed);
      const ratio = await this.getCompressionRatio(filePath, tempCompressed);
      await fs.unlink(tempCompressed);
      
      return ratio < minRatio;
    } catch (error) {
      // If compression fails, don't compress
      return false;
    }
  }

  /**
   * Get appropriate file extension
   */
  getExtension(originalExtension: string, compression: CompressionType): string {
    if (compression === 'gzip') {
      return `${originalExtension}.gz`;
    }
    return originalExtension;
  }

  /**
   * Compress content string and write to file
   */
  async compressString(content: string, outputPath: string): Promise<void> {
    const gzip = createGzip();
    const destination = createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      gzip.on('error', reject);
      destination.on('error', reject);
      destination.on('finish', () => resolve());

      gzip.pipe(destination);
      gzip.write(content);
      gzip.end();
    });
  }
}

/**
 * Helper function to compress files based on config
 */
export async function compressIfNeeded(
  filePaths: string[],
  compression: CompressionType
): Promise<string[]> {
  if (compression === 'none') {
    return filePaths;
  }

  const helper = new CompressionHelper();
  return helper.compressFiles(filePaths);
}
