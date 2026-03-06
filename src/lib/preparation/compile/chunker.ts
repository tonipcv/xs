export interface ChunkConfig {
  chunk_tokens: number;
  overlap_tokens: number;
  preserveMetadata?: boolean;
}

export interface Chunk {
  chunk_id: string;
  text: string;
  metadata: {
    source_id: string;
    chunk_index: number;
    total_chunks: number;
    start_offset: number;
    end_offset: number;
    [key: string]: any;
  };
}

export class Chunker {
  /**
   * Split text into overlapping chunks based on token count
   * Uses simple whitespace tokenization (can be enhanced with tiktoken later)
   */
  chunk(
    text: string,
    sourceId: string,
    config: ChunkConfig,
    additionalMetadata?: Record<string, any>
  ): Chunk[] {
    const tokens = this.tokenize(text);
    const chunks: Chunk[] = [];
    
    const chunkSize = config.chunk_tokens;
    const overlap = config.overlap_tokens;
    const step = chunkSize - overlap;

    let chunkIndex = 0;
    let position = 0;

    while (position < tokens.length) {
      const end = Math.min(position + chunkSize, tokens.length);
      const chunkTokens = tokens.slice(position, end);
      const chunkText = chunkTokens.join(' ');

      chunks.push({
        chunk_id: `${sourceId}_chunk_${chunkIndex}`,
        text: chunkText,
        metadata: {
          source_id: sourceId,
          chunk_index: chunkIndex,
          total_chunks: 0, // Will be updated after all chunks are created
          start_offset: position,
          end_offset: end,
          ...(config.preserveMetadata && additionalMetadata ? additionalMetadata : {}),
        },
      });

      chunkIndex++;
      position += step;

      // Prevent infinite loop if step is 0 or negative
      if (step <= 0) {
        position = end;
      }
    }

    // Update total_chunks in all chunks
    chunks.forEach(chunk => {
      chunk.metadata.total_chunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Simple whitespace tokenization
   * TODO: Replace with tiktoken for accurate token counts
   */
  private tokenize(text: string): string[] {
    return text
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return this.tokenize(text).length;
  }
}
