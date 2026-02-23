/**
 * Weave Embed - Semantic Embedding Service for OpenWeave
 */

// M6 · Embedding-Based Retrieval
export type {
  EmbeddingConfig,
  TextEmbedding,
  NodeEmbedding,
  SimilarityResult,
  HybridSearchResult,
  SearchQuery,
  EmbeddingStats,
} from './types';

export { EmbeddingService } from './embedding-service';
export { VectorStore } from './vector-store';
export { HybridSearch } from './hybrid-search';

// M7 · Automatic Context Grafization
export type {
  ExtractedEntity,
  EntityExtractionConfig,
  ExtractableNodeType,
} from './entity-extractor';

export type {
  DetectedRelationship,
  RelationshipDetectionConfig,
  ExtractableEdgeType,
} from './relationship-detector';

export type {
  GrafizableNode,
  GrafizableEdge,
  GrafizationResult,
  AutoGrafizerConfig,
} from './auto-grafizer';

export { EntityExtractor } from './entity-extractor';
export { RelationshipDetector } from './relationship-detector';
export { AutoGrafizer } from './auto-grafizer';
