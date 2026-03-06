import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { ParquetWriter } from '../formatters/parquet-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { EvalSplitter } from '../eval-splitter';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { EvalFormatter } from '../eval-formatter';
import path from 'path';
import fs from 'fs/promises';

export class EvalDatasetCompiler implements Compiler {
  private parquetWriter: ParquetWriter;
  private jsonlWriter: JsonlWriter;
  private adapter: DatasetAdapter;
  private splitter: EvalSplitter;
  private formatter: EvalFormatter;

  constructor() {
    this.parquetWriter = new ParquetWriter();
    this.jsonlWriter = new JsonlWriter();
    this.adapter = new DatasetAdapter();
    this.splitter = new EvalSplitter();
    this.formatter = new EvalFormatter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    // Format records into standard eval format
    const formattedRecords = this.formatter.format(records.map(r => ({ ...r })) as unknown as Record<string, unknown>[], {
      input_field: config.input_field,
      output_field: config.output_field,
      label_field: config.label_field,
      include_metadata: config.preserveMetadata ?? true,
    });

    // Validate formatted records
    const validation = this.formatter.validate(formattedRecords);
    const validRecords = validation.valid;

    const splitRatios = config.split_ratios ?? { train: 0.7, test: 0.3 };
    const train = splitRatios.train ?? 0.7;
    const test = splitRatios.test ?? 0.3;
    const val = 'val' in splitRatios ? splitRatios.val : undefined;

    const splitResult = this.splitter.split(validRecords, {
      train,
      test,
      val,
      stratify_by: config.stratify_by,
      seed: config.seed,
    });

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });
    const outputPaths: string[] = [];

    const format = config.output_format ?? 'jsonl';

    if (format === 'parquet') {
      const trainPath = path.join(outputDir, 'eval_train.parquet');
      await this.parquetWriter.write(trainPath, splitResult.train);
      outputPaths.push(trainPath);

      const testPath = path.join(outputDir, 'eval_test.parquet');
      await this.parquetWriter.write(testPath, splitResult.test);
      outputPaths.push(testPath);

      if (splitResult.val) {
        const valPath = path.join(outputDir, 'eval_val.parquet');
        await this.parquetWriter.write(valPath, splitResult.val);
        outputPaths.push(valPath);
      }
    } else {
      const trainPath = path.join(outputDir, 'eval_train.jsonl');
      await this.jsonlWriter.write(trainPath, splitResult.train);
      outputPaths.push(trainPath);

      const testPath = path.join(outputDir, 'eval_test.jsonl');
      await this.jsonlWriter.write(testPath, splitResult.test);
      outputPaths.push(testPath);

      if (splitResult.val) {
        const valPath = path.join(outputDir, 'eval_val.jsonl');
        await this.jsonlWriter.write(valPath, splitResult.val);
        outputPaths.push(valPath);
      }
    }

    const stats = this.splitter.getStatistics(splitResult);
    const totalSize = validRecords.length * 1024;

    return {
      shardCount: outputPaths.length,
      totalSizeBytes: totalSize,
      outputPaths,
      recordCount: stats.total,
      format,
      stats: {
        formatted: formattedRecords.length,
        valid: validRecords.length,
        invalid: validation.invalid,
        splits: stats,
      },
    };
  }
}
