import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import path from 'path';
import fs from 'fs/promises';

export class RagCorpusCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const chunkSize = config.chunk_size ?? 512;
    const chunkOverlap = config.chunk_overlap ?? 50;

    const chunks: Array<{ id: string; text: string; metadata: unknown }> = [];

    for (const record of records) {
      const text = record.content;
      const recordChunks = this.chunkText(text, chunkSize, chunkOverlap);

      for (let i = 0; i < recordChunks.length; i++) {
        chunks.push({
          id: `${record.id}_chunk_${i}`,
          text: recordChunks[i],
          metadata: record.metadata ?? {},
        });
      }
    }

    const outputDir = `/tmp/preparation/${datasetId}`;
    const outputPath = path.join(outputDir, 'rag-corpus.jsonl');

    await this.writer.write(outputPath, chunks);

    const totalSize = Buffer.byteLength(JSON.stringify(chunks));

    return {
      shardCount: 1,
      totalSizeBytes: totalSize,
      outputPaths: [outputPath],
    };
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }
}
