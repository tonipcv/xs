import fs from 'fs/promises';
import path from 'path';
import * as tar from 'tar';

export class WebDatasetWriter {
  async write(outputPath: string, records: Array<{ key: string; data: Buffer; ext: string }>): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const tempDir = path.join(path.dirname(outputPath), 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    for (const record of records) {
      const filePath = path.join(tempDir, `${record.key}.${record.ext}`);
      await fs.writeFile(filePath, record.data);
    }

    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: tempDir,
      },
      await fs.readdir(tempDir)
    );

    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
