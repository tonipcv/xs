import fs from 'fs/promises';
import path from 'path';

export class ParquetWriter {
  async write(outputPath: string, records: unknown[]): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const jsonContent = JSON.stringify(records, null, 2);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');
  }
}
