/**
 * Embedding Dataset Formatter
 * Formats records for embedding generation with caching support
 */

export interface EmbeddingRecord {
  id: string;
  text: string;
  embedding?: number[];
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingFormatConfig {
  id_field?: string;
  text_field?: string;
  include_metadata?: boolean;
  metadata_fields?: string[];
  model?: string;
}

export class EmbeddingFormatter {
  format(records: Array<Record<string, unknown>>, config: EmbeddingFormatConfig = {}): EmbeddingRecord[] {
    const idField = config.id_field ?? 'id';
    const textField = config.text_field ?? 'text';
    const includeMetadata = config.include_metadata ?? true;
    const metadataFields = config.metadata_fields;
    const model = config.model ?? 'unknown';

    return records.map((record) => {
      const id = this.extractString(record, idField) || this.generateId();
      const text = this.extractString(record, textField);

      let metadata: Record<string, unknown> | undefined;
      if (includeMetadata) {
        metadata = this.extractMetadata(record, metadataFields, [idField, textField]);
      }

      return {
        id,
        text,
        model,
        ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
      };
    }).filter((record) => this.isValid(record));
  }

  private extractString(record: Record<string, unknown>, field: string): string {
    const value = record[field];
    if (typeof value === 'string') {
      return value;
    }
    if (value !== null && value !== undefined) {
      return String(value);
    }
    return '';
  }

  private generateId(): string {
    return `emb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractMetadata(
    record: Record<string, unknown>,
    metadataFields?: string[],
    excludeFields: string[] = []
  ): Record<string, unknown> {
    if (metadataFields && metadataFields.length > 0) {
      const metadata: Record<string, unknown> = {};
      for (const field of metadataFields) {
        if (field in record) {
          metadata[field] = record[field];
        }
      }
      return metadata;
    }

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!excludeFields.includes(key)) {
        metadata[key] = value;
      }
    }
    return metadata;
  }

  private isValid(record: EmbeddingRecord): boolean {
    return record.text.trim().length > 0;
  }

  validate(records: EmbeddingRecord[]): { valid: EmbeddingRecord[]; invalid: number; errors: string[] } {
    const valid: EmbeddingRecord[] = [];
    let invalid = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record.text || record.text.trim().length === 0) {
        invalid++;
        errors.push(`Record ${i}: missing or empty text`);
        continue;
      }
      if (!record.id) {
        invalid++;
        errors.push(`Record ${i}: missing id`);
        continue;
      }
      valid.push(record);
    }

    return { valid, invalid, errors };
  }

  addEmbeddings(records: EmbeddingRecord[], embeddings: number[][], model: string): EmbeddingRecord[] {
    if (records.length !== embeddings.length) {
      throw new Error(`Records count (${records.length}) does not match embeddings count (${embeddings.length})`);
    }

    return records.map((record, index) => ({
      ...record,
      embedding: embeddings[index],
      model,
    }));
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  getStatistics(records: EmbeddingRecord[]): {
    total: number;
    withEmbeddings: number;
    totalTokens: number;
    avgTextLength: number;
    models: Record<string, number>;
  } {
    let withEmbeddings = 0;
    let totalTokens = 0;
    let totalLength = 0;
    const models: Record<string, number> = {};

    for (const record of records) {
      if (record.embedding) {
        withEmbeddings++;
      }
      const model = record.model ?? 'unknown';
      models[model] = (models[model] || 0) + 1;
      
      totalTokens += this.estimateTokens(record.text);
      totalLength += record.text.length;
    }

    return {
      total: records.length,
      withEmbeddings,
      totalTokens,
      avgTextLength: records.length > 0 ? totalLength / records.length : 0,
      models,
    };
  }

  generateCacheKey(text: string, model: string, version?: string): string {
    // Simple hash for cache key
    const data = `${text}:${model}:${version ?? 'v1'}`;
    return this.simpleHash(data);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
