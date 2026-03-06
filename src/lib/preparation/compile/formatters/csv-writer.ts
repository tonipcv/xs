/**
 * CSV Writer for Data Preparation Pipeline
 * Handles flattening, escaping, and UTF-8 encoding
 */

import { createWriteStream, WriteStream } from 'fs';
import fs from 'fs/promises';

export interface CsvConfig {
  delimiter?: string;
  quote?: string;
  escape?: string;
  lineTerminator?: string;
  maxColumns?: number;
  maxCellLength?: number;
  includeHeader?: boolean;
}

export class CsvWriter {
  private readonly defaultConfig: CsvConfig = {
    delimiter: ',',
    quote: '"',
    escape: '"',
    lineTerminator: '\n',
    maxColumns: 1000,
    maxCellLength: 32768, // 32KB per cell
    includeHeader: true,
  };

  private stream: WriteStream | null = null;
  private config: CsvConfig;
  private headerWritten = false;
  private recordCount = 0;

  constructor(config?: Partial<CsvConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Open file for writing
   */
  async open(filePath: string): Promise<void> {
    this.stream = createWriteStream(filePath, { encoding: 'utf8' });
    this.headerWritten = false;
    this.recordCount = 0;
  }

  /**
   * Flatten nested object to single level
   */
  private flatten(obj: any, prefix = ''): Record<string, string> {
    const flattened: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flatten(value, newKey));
      } else if (Array.isArray(value)) {
        flattened[newKey] = JSON.stringify(value);
      } else {
        flattened[newKey] = String(value);
      }
    }

    return flattened;
  }

  /**
   * Escape cell value
   */
  private escapeCell(value: string): string {
    const { quote, escape, delimiter } = this.config;

    // Truncate if too long
    if (this.config.maxCellLength && value.length > this.config.maxCellLength) {
      value = value.substring(0, this.config.maxCellLength);
    }

    // Check if quoting is needed
    const needsQuoting =
      value.includes(delimiter!) ||
      value.includes(quote!) ||
      value.includes('\n') ||
      value.includes('\r');

    if (needsQuoting) {
      // Escape quotes
      const escaped = value.replace(new RegExp(quote!, 'g'), escape! + quote!);
      return quote + escaped + quote;
    }

    return value;
  }

  /**
   * Write header row
   */
  private async writeHeader(columns: string[]): Promise<void> {
    if (!this.stream || this.headerWritten) {
      return;
    }

    // Validate column count
    if (this.config.maxColumns && columns.length > this.config.maxColumns) {
      throw new Error(
        `Too many columns: ${columns.length} (max: ${this.config.maxColumns})`
      );
    }

    const escapedColumns = columns.map(col => this.escapeCell(col));
    const headerLine = escapedColumns.join(this.config.delimiter!) + this.config.lineTerminator!;

    await new Promise<void>((resolve, reject) => {
      this.stream!.write(headerLine, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    this.headerWritten = true;
  }

  /**
   * Write a single record
   */
  async writeRecord(record: unknown): Promise<void> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    const flattened = this.flatten(record);
    const columns = Object.keys(flattened);

    // Write header if first record
    if (!this.headerWritten && this.config.includeHeader) {
      await this.writeHeader(columns);
    }

    // Write data row
    const values = columns.map(col => this.escapeCell(flattened[col]));
    const dataLine = values.join(this.config.delimiter!) + this.config.lineTerminator!;

    await new Promise<void>((resolve, reject) => {
      this.stream!.write(dataLine, (error) => {
        if (error) reject(error);
        else {
          this.recordCount++;
          resolve();
        }
      });
    });
  }

  /**
   * Write multiple records
   */
  async writeRecords(records: unknown[]): Promise<number> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    for (const record of records) {
      await this.writeRecord(record);
    }

    return this.recordCount;
  }

  /**
   * Close the stream
   */
  async close(): Promise<void> {
    if (!this.stream) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.stream!.end((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.stream = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get number of records written
   */
  getRecordCount(): number {
    return this.recordCount;
  }

  /**
   * Convenience method: write all records and close
   */
  static async writeFile(
    filePath: string,
    records: unknown[],
    config?: Partial<CsvConfig>
  ): Promise<number> {
    const writer = new CsvWriter(config);

    try {
      await writer.open(filePath);
      return await writer.writeRecords(records);
    } finally {
      await writer.close();
    }
  }

  /**
   * Get file size
   */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }
}
