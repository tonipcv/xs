import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class SftJsonlCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const template = config.template ?? 'chatml';
    const formatted = records.map((record) => this.formatRecord(record, template));

    const outputDir = `/tmp/preparation/${datasetId}`;
    const outputPath = path.join(outputDir, 'sft-dataset.jsonl');

    await this.writer.write(outputPath, formatted);

    const totalSize = Buffer.byteLength(JSON.stringify(formatted));

    return {
      shardCount: 1,
      totalSizeBytes: totalSize,
      outputPaths: [outputPath],
    };
  }

  private formatRecord(record: unknown, template: string): unknown {
    const content = record as { instruction?: string; input?: string; output?: string; messages?: unknown[] };

    if (template === 'chatml') {
      return this.formatChatML(content);
    } else if (template === 'alpaca') {
      return this.formatAlpaca(content);
    } else if (template === 'sharegpt') {
      return this.formatShareGPT(content);
    }

    return content;
  }

  private formatChatML(content: { instruction?: string; input?: string; output?: string; messages?: unknown[] }): unknown {
    if (content.messages) {
      return { messages: content.messages };
    }

    const messages = [];
    if (content.instruction) {
      messages.push({ role: 'system', content: content.instruction });
    }
    if (content.input) {
      messages.push({ role: 'user', content: content.input });
    }
    if (content.output) {
      messages.push({ role: 'assistant', content: content.output });
    }

    return { messages };
  }

  private formatAlpaca(content: { instruction?: string; input?: string; output?: string }): unknown {
    return {
      instruction: content.instruction ?? '',
      input: content.input ?? '',
      output: content.output ?? '',
    };
  }

  private formatShareGPT(content: { messages?: unknown[] }): unknown {
    return {
      conversations: content.messages ?? [],
    };
  }
}
