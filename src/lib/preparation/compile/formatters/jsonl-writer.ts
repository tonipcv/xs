import fs from 'fs/promises';
import path from 'path';

export class JsonlWriter {
  async write(outputPath: string, records: unknown[]): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const lines = records.map((record) => JSON.stringify(record));
    const content = lines.join('\n') + '\n';

    await fs.writeFile(outputPath, content, 'utf-8');
  }
}
