/**
 * HuggingFace Dataset Writer
 * Creates dataset_infos.json, state.json, and data shards
 * Compatible with datasets.load_dataset()
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface DatasetInfo {
  description: string;
  citation?: string;
  homepage?: string;
  license?: string;
  features: Record<string, FeatureType>;
  splits: Record<string, SplitInfo>;
  download_size?: number;
  dataset_size?: number;
  size_in_bytes?: number;
}

export interface FeatureType {
  dtype: string;
  id?: string | null;
  _type: 'Value' | 'ClassLabel' | 'Sequence';
}

export interface SplitInfo {
  name: string;
  num_bytes: number;
  num_examples: number;
  dataset_name: string;
}

export interface DatasetState {
  _data_files: Array<{
    filename: string;
    split: string;
  }>;
  _fingerprint: string;
  _format_columns?: string[] | null;
  _format_kwargs: Record<string, unknown>;
  _format_type?: string | null;
  _output_all_columns: boolean;
  _split?: string | null;
}

export interface HuggingFaceConfig {
  datasetName: string;
  description: string;
  shardSize?: number;
  citation?: string;
  homepage?: string;
  license?: string;
}

export class HuggingFaceDatasetWriter {
  private readonly config: HuggingFaceConfig;

  constructor(config: HuggingFaceConfig) {
    this.config = {
      ...config,
      shardSize: config.shardSize || 10000,
    };
  }

  /**
   * Write dataset in HuggingFace format
   */
  async write(
    outputDir: string,
    records: unknown[],
    split: string = 'train'
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    // Create data directory
    const dataDir = path.join(outputDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });

    // Write data shards
    const shards = this.createShards(records, this.config.shardSize!);
    const dataFiles: Array<{ filename: string; split: string }> = [];

    for (let i = 0; i < shards.length; i++) {
      const filename = `${split}-${String(i).padStart(5, '0')}-of-${String(shards.length).padStart(5, '0')}.jsonl`;
      const filepath = path.join(dataDir, filename);

      await this.writeJsonl(filepath, shards[i]);
      dataFiles.push({ filename: `data/${filename}`, split });
    }

    // Infer features from first record
    const features = this.inferFeatures(records[0]);

    // Calculate split info
    const splitInfo: SplitInfo = {
      name: split,
      num_bytes: await this.calculateTotalBytes(dataDir),
      num_examples: records.length,
      dataset_name: this.config.datasetName,
    };

    // Create dataset_infos.json
    const datasetInfo: DatasetInfo = {
      description: this.config.description,
      citation: this.config.citation,
      homepage: this.config.homepage,
      license: this.config.license,
      features,
      splits: {
        [split]: splitInfo,
      },
      dataset_size: splitInfo.num_bytes,
      size_in_bytes: splitInfo.num_bytes,
    };

    await fs.writeFile(
      path.join(outputDir, 'dataset_infos.json'),
      JSON.stringify({ [this.config.datasetName]: datasetInfo }, null, 2),
      'utf-8'
    );

    // Create state.json
    const state: DatasetState = {
      _data_files: dataFiles,
      _fingerprint: this.generateFingerprint(records),
      _format_kwargs: {},
      _output_all_columns: true,
      _split: split,
    };

    await fs.writeFile(
      path.join(outputDir, 'state.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    // Create README.md
    await this.writeReadme(outputDir, datasetInfo);
  }

  /**
   * Write multiple splits
   */
  async writeMultipleSplits(
    outputDir: string,
    splits: Record<string, unknown[]>
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    const dataDir = path.join(outputDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });

    const allDataFiles: Array<{ filename: string; split: string }> = [];
    const splitInfos: Record<string, SplitInfo> = {};

    // Write each split
    for (const [splitName, records] of Object.entries(splits)) {
      const shards = this.createShards(records, this.config.shardSize!);

      for (let i = 0; i < shards.length; i++) {
        const filename = `${splitName}-${String(i).padStart(5, '0')}-of-${String(shards.length).padStart(5, '0')}.jsonl`;
        const filepath = path.join(dataDir, filename);

        await this.writeJsonl(filepath, shards[i]);
        allDataFiles.push({ filename: `data/${filename}`, split: splitName });
      }

      splitInfos[splitName] = {
        name: splitName,
        num_bytes: await this.calculateSplitBytes(dataDir, splitName),
        num_examples: records.length,
        dataset_name: this.config.datasetName,
      };
    }

    // Infer features from first split's first record
    const firstSplit = Object.values(splits)[0];
    const features = this.inferFeatures(firstSplit[0]);

    // Calculate total size
    const totalBytes = Object.values(splitInfos).reduce((sum, info) => sum + info.num_bytes, 0);

    // Create dataset_infos.json
    const datasetInfo: DatasetInfo = {
      description: this.config.description,
      citation: this.config.citation,
      homepage: this.config.homepage,
      license: this.config.license,
      features,
      splits: splitInfos,
      dataset_size: totalBytes,
      size_in_bytes: totalBytes,
    };

    await fs.writeFile(
      path.join(outputDir, 'dataset_infos.json'),
      JSON.stringify({ [this.config.datasetName]: datasetInfo }, null, 2),
      'utf-8'
    );

    // Create state.json
    const state: DatasetState = {
      _data_files: allDataFiles,
      _fingerprint: this.generateFingerprint(Object.values(splits).flat()),
      _format_kwargs: {},
      _output_all_columns: true,
    };

    await fs.writeFile(
      path.join(outputDir, 'state.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    // Create README.md
    await this.writeReadme(outputDir, datasetInfo);
  }

  /**
   * Create shards from records
   */
  private createShards(records: unknown[], shardSize: number): unknown[][] {
    const shards: unknown[][] = [];

    for (let i = 0; i < records.length; i += shardSize) {
      shards.push(records.slice(i, i + shardSize));
    }

    return shards;
  }

  /**
   * Write JSONL file
   */
  private async writeJsonl(filepath: string, records: unknown[]): Promise<void> {
    const lines = records.map(record => JSON.stringify(record)).join('\n');
    await fs.writeFile(filepath, lines + '\n', 'utf-8');
  }

  /**
   * Infer features from record
   */
  private inferFeatures(record: unknown): Record<string, FeatureType> {
    const features: Record<string, FeatureType> = {};

    if (!record || typeof record !== 'object') {
      return features;
    }

    for (const [key, value] of Object.entries(record)) {
      const dtype = this.inferDtype(value);
      features[key] = {
        dtype,
        _type: 'Value',
      };
    }

    return features;
  }

  /**
   * Infer dtype from value
   */
  private inferDtype(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      return 'string';
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int64' : 'float64';
    }

    if (typeof value === 'boolean') {
      return 'bool';
    }

    if (Array.isArray(value)) {
      return 'list';
    }

    return 'string';
  }

  /**
   * Calculate total bytes in directory
   */
  private async calculateTotalBytes(dir: string): Promise<number> {
    const files = await fs.readdir(dir);
    let totalBytes = 0;

    for (const file of files) {
      const filepath = path.join(dir, file);
      const stats = await fs.stat(filepath);
      totalBytes += stats.size;
    }

    return totalBytes;
  }

  /**
   * Calculate bytes for specific split
   */
  private async calculateSplitBytes(dir: string, split: string): Promise<number> {
    const files = await fs.readdir(dir);
    let totalBytes = 0;

    for (const file of files) {
      if (file.startsWith(split)) {
        const filepath = path.join(dir, file);
        const stats = await fs.stat(filepath);
        totalBytes += stats.size;
      }
    }

    return totalBytes;
  }

  /**
   * Generate fingerprint for dataset
   */
  private generateFingerprint(records: unknown[]): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(records));
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Write README.md
   */
  private async writeReadme(outputDir: string, info: DatasetInfo): Promise<void> {
    const readme = `# ${this.config.datasetName}

${info.description}

## Dataset Structure

### Data Splits

${Object.entries(info.splits).map(([name, split]) => 
  `- **${name}**: ${split.num_examples} examples (${(split.num_bytes / 1024 / 1024).toFixed(2)} MB)`
).join('\n')}

### Features

${Object.entries(info.features).map(([name, feature]) => 
  `- **${name}**: ${feature.dtype}`
).join('\n')}

## Usage

\`\`\`python
from datasets import load_dataset

dataset = load_dataset("${this.config.datasetName}")
\`\`\`

${info.citation ? `## Citation

\`\`\`
${info.citation}
\`\`\`
` : ''}

${info.license ? `## License

${info.license}` : ''}
`;

    await fs.writeFile(path.join(outputDir, 'README.md'), readme, 'utf-8');
  }
}
