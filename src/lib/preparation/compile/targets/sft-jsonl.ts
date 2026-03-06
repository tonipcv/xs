import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { SFTTemplates, SFTExample } from '../sft-templates';
import path from 'path';
import fs from 'fs/promises';

export class SftJsonlCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;
  private templates: SFTTemplates;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
    this.templates = new SFTTemplates();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const template = config.template ?? 'chatml';
    const systemPrompt = config.system_prompt;
    const instruction = config.instruction;

    const formatted: unknown[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const record of records) {
      const content = record as { instruction?: string; input?: string; output?: string; system?: string };
      
      const example: SFTExample = {
        input: content.input ?? '',
        output: content.output ?? '',
        system: systemPrompt ?? content.system,
        instruction: instruction ?? content.instruction,
      };

      const validation = this.templates.validate(example);
      if (!validation.valid) {
        invalidCount++;
        continue;
      }

      const formattedExample = this.templates.format(example, template);
      formatted.push(formattedExample);
      validCount++;
    }

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'sft-dataset.jsonl');

    await this.writer.write(outputPath, formatted);

    const stats = await fs.stat(outputPath);

    return {
      shardCount: 1,
      totalSizeBytes: stats.size,
      outputPaths: [outputPath],
      recordCount: validCount,
      format: 'jsonl',
    };
  }
}
