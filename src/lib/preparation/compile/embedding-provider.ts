/**
 * Real Embeddings Provider
 * Generates embeddings using OpenAI or Cohere APIs
 */

import { openai } from '@/lib/openai';

export interface EmbeddingProviderConfig {
  provider: 'openai' | 'cohere';
  model: string;
  apiKey?: string;
  batchSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface EmbeddingRequest {
  id: string;
  text: string;
}

export interface EmbeddingResponse {
  id: string;
  embedding: number[];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResponse[];
  failed: Array<{ id: string; error: string }>;
  totalTokens: number;
}

export class RealEmbeddingProvider {
  private config: EmbeddingProviderConfig;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingProviderConfig) {
    this.config = {
      batchSize: 100,
      maxRetries: 3,
      timeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Generate embeddings for a batch of texts using OpenAI API
   */
  async generateEmbeddingsOpenAI(requests: EmbeddingRequest[]): Promise<BatchEmbeddingResult> {
    const embeddings: EmbeddingResponse[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    let totalTokens = 0;

    // Process in batches
    const batchSize = this.config.batchSize || 100;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      try {
        // Check cache first
        const uncachedBatch: EmbeddingRequest[] = [];
        for (const req of batch) {
          const cacheKey = this.generateCacheKey(req.text, this.config.model);
          const cached = this.cache.get(cacheKey);
          if (cached) {
            embeddings.push({
              id: req.id,
              embedding: cached,
              model: this.config.model,
            });
          } else {
            uncachedBatch.push(req);
          }
        }

        if (uncachedBatch.length === 0) continue;

        // Call OpenAI API
        const response = await openai.embeddings.create({
          model: this.config.model,
          input: uncachedBatch.map(r => r.text),
          encoding_format: 'float',
        });

        // Map responses back to IDs
        for (let j = 0; j < uncachedBatch.length; j++) {
          const req = uncachedBatch[j];
          const embedding = response.data[j]?.embedding;
          
          if (embedding) {
            // Store in cache
            const cacheKey = this.generateCacheKey(req.text, this.config.model);
            this.cache.set(cacheKey, embedding);

            embeddings.push({
              id: req.id,
              embedding,
              model: this.config.model,
              usage: {
                promptTokens: response.usage?.prompt_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
              },
            });
          } else {
            failed.push({ id: req.id, error: 'No embedding returned from API' });
          }
        }

        totalTokens += response.usage?.total_tokens || 0;
      } catch (error) {
        // Mark all in batch as failed
        for (const req of batch) {
          failed.push({
            id: req.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { embeddings, failed, totalTokens };
  }

  /**
   * Generate embeddings using Cohere API
   */
  async generateEmbeddingsCohere(requests: EmbeddingRequest[]): Promise<BatchEmbeddingResult> {
    const embeddings: EmbeddingResponse[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    let totalTokens = 0;

    const apiKey = this.config.apiKey || process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('Cohere API key not provided');
    }

    // Process in batches
    const batchSize = this.config.batchSize || 96; // Cohere max batch size
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      try {
        const response = await fetch('https://api.cohere.com/v1/embed', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            texts: batch.map(r => r.text),
            input_type: 'search_document',
            embedding_types: ['float'],
          }),
        });

        if (!response.ok) {
          throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Map responses back to IDs
        for (let j = 0; j < batch.length; j++) {
          const req = batch[j];
          const embedding = data.embeddings?.float?.[j];
          
          if (embedding) {
            embeddings.push({
              id: req.id,
              embedding,
              model: this.config.model,
            });
          } else {
            failed.push({ id: req.id, error: 'No embedding returned from Cohere API' });
          }
        }

        totalTokens += data.meta?.billed_units?.input_tokens || 0;
      } catch (error) {
        for (const req of batch) {
          failed.push({
            id: req.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { embeddings, failed, totalTokens };
  }

  /**
   * Generate embeddings using configured provider
   */
  async generateEmbeddings(requests: EmbeddingRequest[]): Promise<BatchEmbeddingResult> {
    if (this.config.provider === 'openai') {
      return this.generateEmbeddingsOpenAI(requests);
    } else if (this.config.provider === 'cohere') {
      return this.generateEmbeddingsCohere(requests);
    } else {
      throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.generateCacheKey(text, this.config.model);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.generateEmbeddings([{ id: 'single', text }]);
    if (result.failed.length > 0) {
      throw new Error(`Failed to generate embedding: ${result.failed[0].error}`);
    }
    return result.embeddings[0].embedding;
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }

  private generateCacheKey(text: string, model: string): string {
    // Simple hash for cache key
    const data = `${text}:${model}`;
    return this.simpleHash(data);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export default RealEmbeddingProvider;
