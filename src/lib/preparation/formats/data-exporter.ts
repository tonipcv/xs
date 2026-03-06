/**
 * Data Exporter for Data Preparation Pipeline
 * Exports data in various formats with progress tracking
 */

import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export interface ExportConfig {
  format: 'jsonl' | 'csv' | 'parquet' | 'json';
  compression?: 'none' | 'gzip';
  batchSize?: number;
  outputPath: string;
  includeMetadata?: boolean;
  flattenNested?: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  recordCount: number;
  bytesWritten: number;
  durationMs: number;
  checksum?: string;
  error?: string;
}

export interface ExportProgress {
  processed: number;
  total: number;
  percentage: number;
}

export class DataExporter {
  async export(
    data: Array<Record<string, unknown>>,
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      // Ensure output directory exists
      await fs.mkdir(path.dirname(config.outputPath), { recursive: true });

      let recordCount = 0;
      const batchSize = config.batchSize ?? 1000;

      switch (config.format) {
        case 'jsonl':
          recordCount = await this.exportJsonl(data, config, onProgress, batchSize);
          break;
        case 'csv':
          recordCount = await this.exportCsv(data, config, onProgress, batchSize);
          break;
        case 'json':
          recordCount = await this.exportJson(data, config, onProgress);
          break;
        default:
          throw new Error(`Unsupported format: ${config.format}`);
      }

      // Apply compression if requested
      if (config.compression === 'gzip') {
        await this.compressFile(config.outputPath);
      }

      // Get file stats
      const stats = await fs.stat(config.outputPath + (config.compression === 'gzip' ? '.gz' : ''));
      const bytesWritten = stats.size;

      // Calculate checksum
      const checksum = await this.calculateChecksum(config.outputPath + (config.compression === 'gzip' ? '.gz' : ''));

      return {
        success: true,
        outputPath: config.outputPath + (config.compression === 'gzip' ? '.gz' : ''),
        recordCount,
        bytesWritten,
        durationMs: Date.now() - startTime,
        checksum,
      };
    } catch (error) {
      return {
        success: false,
        outputPath: config.outputPath,
        recordCount: 0,
        bytesWritten: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async exportJsonl(
    data: Array<Record<string, unknown>>,
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void,
    batchSize = 1000
  ): Promise<number> {
    const chunks: string[] = [];
    let processed = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const lines = batch.map((item) => JSON.stringify(item)).join('\n') + '\n';
      chunks.push(lines);
      
      processed += batch.length;
      onProgress?.({
        processed,
        total: data.length,
        percentage: Math.round((processed / data.length) * 100),
      });
    }

    await fs.writeFile(config.outputPath, chunks.join(''), 'utf-8');
    return data.length;
  }

  private async exportCsv(
    data: Array<Record<string, unknown>>,
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void,
    batchSize = 1000
  ): Promise<number> {
    if (data.length === 0) {
      await fs.writeFile(config.outputPath, '', 'utf-8');
      return 0;
    }

    // Get all unique columns
    const columns = new Set<string>();
    data.forEach((item) => {
      Object.keys(item).forEach((key) => columns.add(key));
    });
    const headers = Array.from(columns);

    const rows: string[] = [headers.join(',')];
    let processed = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      for (const item of batch) {
        const row = headers.map((header) => {
          const value = item[header];
          if (value === null || value === undefined) return '';
          const str = String(value);
          // Escape CSV special characters
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',');
        rows.push(row);
      }

      processed += batch.length;
      onProgress?.({
        processed,
        total: data.length,
        percentage: Math.round((processed / data.length) * 100),
      });
    }

    await fs.writeFile(config.outputPath, rows.join('\n'), 'utf-8');
    return data.length;
  }

  private async exportJson(
    data: Array<Record<string, unknown>>,
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<number> {
    await fs.writeFile(config.outputPath, JSON.stringify(data, null, 2), 'utf-8');
    
    onProgress?.({
      processed: data.length,
      total: data.length,
      percentage: 100,
    });

    return data.length;
  }

  private async compressFile(filePath: string): Promise<void> {
    const source = await fs.open(filePath, 'r');
    const dest = await fs.open(filePath + '.gz', 'w');
    
    try {
      const readStream = source.createReadStream();
      const gzipStream = createGzip();
      const writeStream = dest.createWriteStream();
      
      await pipeline(readStream, gzipStream, writeStream);
      await fs.unlink(filePath);
    } finally {
      await source.close();
      await dest.close();
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async streamExport(
    dataGenerator: AsyncGenerator<Record<string, unknown>, void, unknown>,
    config: ExportConfig
  ): Promise<ExportResult> {
    const startTime = Date.now();
    let recordCount = 0;

    try {
      await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
      const writeStream = (await fs.open(config.outputPath, 'w')).createWriteStream();

      for await (const record of dataGenerator) {
        const line = JSON.stringify(record) + '\n';
        writeStream.write(line);
        recordCount++;
      }

      writeStream.end();

      return {
        success: true,
        outputPath: config.outputPath,
        recordCount,
        bytesWritten: (await fs.stat(config.outputPath)).size,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        outputPath: config.outputPath,
        recordCount,
        bytesWritten: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
