import { Compiler, CompileResult } from '../compiler-registry';
import { PreparationConfig } from '../../preparation.types';
import { JsonlWriter } from '../formatters/jsonl-writer';
import { DatasetAdapter } from '../../adapters/dataset-adapter';
import { Chunker } from '../chunker';
import path from 'path';
import fs from 'fs/promises';

export class RagCorpusCompiler implements Compiler {
  private writer: JsonlWriter;
  private adapter: DatasetAdapter;
  private chunker: Chunker;

  constructor() {
    this.writer = new JsonlWriter();
    this.adapter = new DatasetAdapter();
    this.chunker = new Chunker();
  }

  async compile(datasetId: string, config: PreparationConfig): Promise<CompileResult> {
    const records = await this.adapter.getRecords(datasetId);

    const chunkTokens = config.chunk_tokens ?? 512;
    const overlapTokens = config.overlap_tokens ?? 50;
    const preserveMetadata = config.preserveMetadata ?? true;

    const allChunks: Array<{ chunk_id: string; text: string; metadata: unknown }> = [];

    for (const record of records) {
      const text = record.content;
      const recordChunks = this.chunker.chunk(
        text,
        record.id,
        {
          chunk_tokens: chunkTokens,
          overlap_tokens: overlapTokens,
          preserveMetadata,
        },
        record.metadata
      );

      for (const chunk of recordChunks) {
        allChunks.push({
          chunk_id: chunk.chunk_id,
          text: chunk.text,
          metadata: chunk.metadata,
        });
      }
    }

    const outputDir = `/tmp/preparation/${datasetId}`;
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'rag-corpus.jsonl');

    await this.writer.write(outputPath, allChunks);

    const stats = await fs.stat(outputPath);

    return {
      shardCount: 1,
      totalSizeBytes: stats.size,
      outputPaths: [outputPath],
      recordCount: allChunks.length,
      format: 'jsonl',
    };
  }
}
