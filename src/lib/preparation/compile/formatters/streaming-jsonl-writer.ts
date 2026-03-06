/**
 * Streaming JSONL Writer for Data Preparation Pipeline
 * Writes JSONL files without loading all data into memory
 */

import { createWriteStream, WriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import fs from 'fs/promises';

export class StreamingJsonlWriter {
  private stream: WriteStream | null = null;
  private recordCount = 0;

  /**
   * Open file for streaming writes
   */
  async open(filePath: string): Promise<void> {
    this.stream = createWriteStream(filePath, { encoding: 'utf8' });
    this.recordCount = 0;
  }

  /**
   * Write a single record
   */
  async writeRecord(record: unknown): Promise<void> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    const line = JSON.stringify(record) + '\n';
    
    return new Promise((resolve, reject) => {
      const canContinue = this.stream!.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          this.recordCount++;
          resolve();
        }
      });

      // If buffer is full, wait for drain event
      if (!canContinue) {
        this.stream!.once('drain', () => resolve());
      }
    });
  }

  /**
   * Write multiple records in streaming fashion
   */
  async writeRecords(records: AsyncIterable<unknown> | Iterable<unknown>): Promise<number> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    for await (const record of records) {
      await this.writeRecord(record);
    }

    return this.recordCount;
  }

  /**
   * Write records from array (batched for memory efficiency)
   */
  async writeArray(records: unknown[], batchSize: number = 1000): Promise<number> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      for (const record of batch) {
        await this.writeRecord(record);
      }

      // Allow garbage collection between batches
      if (i + batchSize < records.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
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
   * Write records from generator function
   */
  async writeFromGenerator(
    generator: () => AsyncGenerator<unknown> | Generator<unknown>
  ): Promise<number> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    const gen = generator();
    
    for await (const record of gen) {
      await this.writeRecord(record);
    }

    return this.recordCount;
  }

  /**
   * Write records with transformation
   */
  async writeWithTransform<T>(
    records: AsyncIterable<T> | Iterable<T>,
    transform: (record: T) => unknown
  ): Promise<number> {
    if (!this.stream) {
      throw new Error('Stream not opened. Call open() first.');
    }

    for await (const record of records) {
      const transformed = transform(record);
      await this.writeRecord(transformed);
    }

    return this.recordCount;
  }

  /**
   * Convenience method: write all records and close
   */
  static async writeFile(
    filePath: string,
    records: unknown[] | AsyncIterable<unknown> | Iterable<unknown>
  ): Promise<number> {
    const writer = new StreamingJsonlWriter();
    
    try {
      await writer.open(filePath);
      
      if (Array.isArray(records)) {
        return await writer.writeArray(records);
      } else {
        return await writer.writeRecords(records);
      }
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

/**
 * Helper: Create async generator from array (for testing)
 */
export async function* arrayToAsyncGenerator<T>(array: T[]): AsyncGenerator<T> {
  for (const item of array) {
    yield item;
    // Simulate async operation
    await new Promise(resolve => setImmediate(resolve));
  }
}
