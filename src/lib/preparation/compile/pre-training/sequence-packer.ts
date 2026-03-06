/**
 * Sequence Packer for Pre-training Pipeline
 * Packs multiple documents into sequences up to max_tokens
 */

export interface PackingConfig {
  maxTokens: number;
  seed?: number;
  addEosToken?: boolean;
  eosToken?: string;
  separator?: string;
}

export interface Document {
  id: string;
  text: string;
  tokenCount?: number;
}

export interface PackedSequence {
  text: string;
  tokenCount: number;
  documentCount: number;
  documentIds: string[];
}

export interface PackingStats {
  totalDocuments: number;
  totalSequences: number;
  totalTokens: number;
  avgDocsPerSequence: number;
  avgTokensPerSequence: number;
  packingEfficiency: number;
}

export interface PackingResult {
  sequences: PackedSequence[];
  stats: PackingStats;
}

export class SequencePacker {
  private readonly config: Required<PackingConfig>;

  constructor(config: PackingConfig) {
    if (!config?.maxTokens || config.maxTokens <= 0) {
      throw new Error('SequencePacker requires a positive maxTokens value');
    }

    this.config = {
      maxTokens: config.maxTokens,
      seed: config.seed ?? 2026,
      addEosToken: config.addEosToken ?? true,
      eosToken: config.eosToken ?? '<|endoftext|>',
      separator: config.separator ?? '\n',
    };
  }

  pack(documents: Document[]): PackingResult {
    if (!Array.isArray(documents)) {
      throw new Error('SequencePacker.pack expects an array of documents');
    }

    const validDocs = documents.filter((doc) => this.isValidDocument(doc));
    if (validDocs.length === 0) {
      return this.emptyResult();
    }

    const eosTokenCost = this.config.addEosToken ? this.getTokenEstimate(this.config.eosToken) : 0;
    const flattenedDocs = this.flattenLargeDocuments(validDocs, eosTokenCost);
    const shuffledDocs = this.shuffle(flattenedDocs);

    const sequences: PackedSequence[] = [];
    let currentParts: string[] = [];
    let currentDocIds: string[] = [];
    let currentTokens = 0;

    const flush = () => {
      if (currentDocIds.length === 0) {
        return;
      }
      sequences.push({
        text: currentParts.join(this.config.separator),
        tokenCount: currentTokens,
        documentCount: currentDocIds.length,
        documentIds: [...currentDocIds],
      });
      currentParts = [];
      currentDocIds = [];
      currentTokens = 0;
    };

    for (const doc of shuffledDocs) {
      const trimmedText = doc.text.trim();
      const baseTokens = this.getTokenEstimate(trimmedText, doc.tokenCount);
      const docTokens = baseTokens + eosTokenCost;
      if (docTokens === 0) {
        continue;
      }

      if (docTokens > this.config.maxTokens) {
        // Should not happen after flattenLargeDocuments, but guard anyway
        continue;
      }

      if (currentTokens + docTokens > this.config.maxTokens) {
        flush();
      }

      currentParts.push(this.decorateDocument(trimmedText));
      currentDocIds.push(doc.id);
      currentTokens += docTokens;
    }

    flush();

    return {
      sequences,
      stats: this.calculateStats(sequences, validDocs.length),
    };
  }

  private isValidDocument(doc: Document | undefined): doc is Document {
    return Boolean(doc && doc.id && typeof doc.text === 'string' && doc.text.trim().length > 0);
  }

  private emptyResult(): PackingResult {
    return {
      sequences: [],
      stats: {
        totalDocuments: 0,
        totalSequences: 0,
        totalTokens: 0,
        avgDocsPerSequence: 0,
        avgTokensPerSequence: 0,
        packingEfficiency: 0,
      },
    };
  }

  private flattenLargeDocuments(documents: Document[], eosTokenCost: number): Document[] {
    const flattened: Document[] = [];
    const availableTokens = Math.max(1, this.config.maxTokens - eosTokenCost);
    const maxChars = Math.max(4, availableTokens * 4); // heuristic 4 chars per token

    for (const doc of documents) {
      if (this.getTokenEstimate(doc.text, doc.tokenCount) + eosTokenCost <= this.config.maxTokens) {
        flattened.push(doc);
        continue;
      }

      const chunks = this.chunkText(doc.text, maxChars);
      chunks.forEach((chunk, index) => {
        flattened.push({
          id: `${doc.id}#${index}`,
          text: chunk,
          tokenCount: this.getTokenEstimate(chunk),
        });
      });
    }

    return flattened;
  }

  private chunkText(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) {
      return [text];
    }

    const tokens = text.match(/(\s+|\S+)/g) ?? [text];
    const chunks: string[] = [];

    // If there are no whitespace boundaries, fall back to fixed-size slicing
    if (tokens.length === 1 && !/\s/.test(text)) {
      for (let i = 0; i < text.length; i += maxChars) {
        chunks.push(text.slice(i, i + maxChars));
      }
      return chunks;
    }

    let current = '';
    for (const token of tokens) {
      if (current.length + token.length > maxChars && current.length > 0) {
        chunks.push(current);
        current = '';
      }
      current += token;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  private decorateDocument(text: string): string {
    if (!this.config.addEosToken) {
      return text;
    }
    return `${text}${this.config.separator}${this.config.eosToken}`;
  }

  private getTokenEstimate(text: string, provided?: number): number {
    if (typeof provided === 'number' && provided > 0) {
      return provided;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(trimmed.length / 4));
  }

  private shuffle(documents: Document[]): Document[] {
    const rng = this.mulberry32(this.config.seed);
    const result = [...documents];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private mulberry32(seed: number) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private calculateStats(sequences: PackedSequence[], totalDocuments: number): PackingStats {
    if (sequences.length === 0) {
      return {
        totalDocuments,
        totalSequences: 0,
        totalTokens: 0,
        avgDocsPerSequence: 0,
        avgTokensPerSequence: 0,
        packingEfficiency: 0,
      };
    }

    const totalTokens = sequences.reduce((sum, seq) => sum + seq.tokenCount, 0);
    const totalDocsPacked = sequences.reduce((sum, seq) => sum + seq.documentCount, 0);

    return {
      totalDocuments,
      totalSequences: sequences.length,
      totalTokens,
      avgDocsPerSequence: totalDocsPacked / sequences.length,
      avgTokensPerSequence: totalTokens / sequences.length,
      packingEfficiency: Math.min(100, (totalTokens / (this.config.maxTokens * sequences.length)) * 100),
    };
  }
}
