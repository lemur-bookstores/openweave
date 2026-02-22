/**
 * Embedding Service - Local transformer-based text embedding
 */

import { pipeline } from '@xenova/transformers';
import { TextEmbedding, EmbeddingConfig } from './types';

export class EmbeddingService {
  private config: EmbeddingConfig;
  private pipeline: unknown | null = null;
  private isInitialized = false;
  private embeddingCache = new Map<string, number[]>();

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      modelName: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      pooling: 'mean',
      normalize: true,
      batchSize: 32,
      maxSequenceLength: 512,
      ...config,
    };
  }

  /**
   * Initialize the embedding pipeline
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.pipeline = await pipeline('feature-extraction', this.config.modelName);
      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize embedding service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Embed a single text
   */
  async embed(text: string): Promise<TextEmbedding> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      const cached = this.embeddingCache.get(cacheKey)!;
      return {
        text,
        embedding: cached,
        dimension: this.config.dimension,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      if (!this.pipeline) {
        throw new Error('Pipeline not initialized');
      }

      const result = await (this.pipeline as any)(this.normalizeText(text), {
        pooling: this.config.pooling,
        normalize: this.config.normalize,
      });

      const embedding = Array.from(result.data as Float32Array);

      this.embeddingCache.set(cacheKey, embedding);

      return {
        text,
        embedding,
        dimension: this.config.dimension,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to embed text: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Embed multiple texts
   */
  async embedBatch(texts: string[]): Promise<TextEmbedding[]> {
    const results: TextEmbedding[] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchResults = await Promise.all(batch.map((text) => this.embed(text)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate Euclidean distance between two embeddings
   */
  euclideanDistance(embedding1: number[], embedding2: number[]): number {
    let sum = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const diff = embedding1[i] - embedding2[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Normalize text for embedding
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, this.config.maxSequenceLength);
  }

  /**
   * Create cache key for text
   */
  private getCacheKey(text: string): string {
    return this.normalizeText(text);
  }

  /**
   * Get configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.embeddingCache.size;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
