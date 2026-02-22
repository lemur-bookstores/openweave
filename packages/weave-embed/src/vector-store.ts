/**
 * Vector Store - In-memory vector database with similarity search
 */

import { NodeEmbedding, SimilarityResult, EmbeddingStats } from './types';
import { EmbeddingService } from './embedding-service';

export class VectorStore {
  private embeddings = new Map<string, NodeEmbedding>();
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService =
      embeddingService ||
      new EmbeddingService({
        modelName: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
      });
  }

  /**
   * Add or update a node embedding
   */
  async addNodeEmbedding(
    nodeId: string,
    nodeLabel: string,
    text: string,
    modelVersion = '1.0'
  ): Promise<NodeEmbedding> {
    const textEmbedding = await this.embeddingService.embed(text);

    const nodeEmbedding: NodeEmbedding = {
      nodeId,
      nodeLabel,
      embedding: textEmbedding.embedding,
      dimension: textEmbedding.dimension,
      modelVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.embeddings.set(nodeId, nodeEmbedding);
    return nodeEmbedding;
  }

  /**
   * Add multiple node embeddings
   */
  async addNodeEmbeddingsBatch(
    nodes: Array<{
      nodeId: string;
      nodeLabel: string;
      text: string;
    }>,
    modelVersion = '1.0'
  ): Promise<NodeEmbedding[]> {
    const results: NodeEmbedding[] = [];

    for (const node of nodes) {
      const embedding = await this.addNodeEmbedding(
        node.nodeId,
        node.nodeLabel,
        node.text,
        modelVersion
      );
      results.push(embedding);
    }

    return results;
  }

  /**
   * Search for similar nodes using cosine similarity
   */
  async searchSimilar(text: string, topK = 5, threshold = 0.0): Promise<SimilarityResult[]> {
    const queryEmbedding = await this.embeddingService.embed(text);

    const results: SimilarityResult[] = [];

    for (const [nodeId, nodeEmbedding] of this.embeddings) {
      const similarity = this.embeddingService.cosineSimilarity(
        queryEmbedding.embedding,
        nodeEmbedding.embedding
      );

      if (similarity >= threshold) {
        results.push({
          nodeId,
          nodeLabel: nodeEmbedding.nodeLabel,
          similarity,
          distance: this.embeddingService.euclideanDistance(
            queryEmbedding.embedding,
            nodeEmbedding.embedding
          ),
        });
      }
    }

    // Sort by similarity descending and return top K
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  /**
   * Get embedding for a specific node
   */
  getNodeEmbedding(nodeId: string): NodeEmbedding | undefined {
    return this.embeddings.get(nodeId);
  }

  /**
   * Check if a node has an embedding
   */
  hasEmbedding(nodeId: string): boolean {
    return this.embeddings.has(nodeId);
  }

  /**
   * Remove node embedding
   */
  removeNodeEmbedding(nodeId: string): boolean {
    return this.embeddings.delete(nodeId);
  }

  /**
   * Get all node IDs with embeddings
   */
  getNodeIds(): string[] {
    return Array.from(this.embeddings.keys());
  }

  /**
   * Get statistics
   */
  getStats(): EmbeddingStats {
    const embeddings = Array.from(this.embeddings.values());
    const memoryUsageBytes = embeddings.reduce((sum, emb) => {
      return sum + emb.embedding.length * 8; // 8 bytes per float64
    }, 0);

    return {
      totalNodes: this.embeddings.size,
      embeddedNodes: this.embeddings.size,
      pendingNodes: 0,
      modelDimension: embeddings.length > 0 ? embeddings[0].dimension : 0,
      memoryUsageBytes,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Clear all embeddings
   */
  clear(): void {
    this.embeddings.clear();
  }

  /**
   * Get embedding service
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /**
   * Export embeddings as JSON
   */
  export(): Record<string, NodeEmbedding> {
    const result: Record<string, NodeEmbedding> = {};
    for (const [nodeId, embedding] of this.embeddings) {
      result[nodeId] = embedding;
    }
    return result;
  }

  /**
   * Import embeddings from JSON
   */
  import(data: Record<string, NodeEmbedding>): void {
    this.embeddings.clear();
    for (const [nodeId, embedding] of Object.entries(data)) {
      this.embeddings.set(nodeId, embedding);
    }
  }
}
