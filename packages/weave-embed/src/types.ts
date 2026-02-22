/**
 * Weave Embed - Type Definitions
 */

export interface EmbeddingConfig {
  modelName: string;
  dimension: number;
  pooling: 'mean' | 'max' | 'cls';
  normalize: boolean;
  batchSize: number;
  maxSequenceLength: number;
}

export interface TextEmbedding {
  text: string;
  embedding: number[];
  dimension: number;
  timestamp: string;
}

export interface NodeEmbedding {
  nodeId: string;
  nodeLabel: string;
  embedding: number[];
  dimension: number;
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimilarityResult {
  nodeId: string;
  nodeLabel: string;
  similarity: number;
  distance: number;
  metadata?: Record<string, unknown>;
}

export interface HybridSearchResult {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  semanticScore: number;
  structuralScore: number;
  combinedScore: number;
  explanation: string;
}

export interface SearchQuery {
  text: string;
  topK: number;
  threshold?: number;
  useStructuralSearch?: boolean;
  weights?: {
    semantic: number;
    structural: number;
  };
}

export interface EmbeddingStats {
  totalNodes: number;
  embeddedNodes: number;
  pendingNodes: number;
  modelDimension: number;
  memoryUsageBytes: number;
  lastUpdated: string;
}
