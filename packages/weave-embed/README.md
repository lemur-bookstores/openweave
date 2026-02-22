# 🧠 WeaveEmbed - Semantic Embedding Service

**Semantic search engine for OpenWeave** using local transformer-based embeddings with no external API dependencies.

## Features

- 🚀 **Local Embeddings**: Uses `@xenova/transformers` for zero-overhead semantic encoding
- 🔍 **Hybrid Search**: Combines semantic similarity with structural graph information
- 💾 **In-Memory Vector Store**: Fast similarity search with import/export support
- ⚡ **Cached Embeddings**: Intelligent caching to avoid redundant computations
- 📊 **Ranking**: Multi-factor scoring (semantic + structural + frequency)

## Installation

```bash
pnpm add @openweave/weave-embed
```

## Quick Start

### Basic Embedding

```typescript
import { EmbeddingService } from '@openweave/weave-embed';

const service = new EmbeddingService();
await service.initialize();

const embedding = await service.embed('Hello world');
console.log(embedding.embedding); // [0.123, -0.456, ...]
```

### Vector Search

```typescript
import { VectorStore } from '@openweave/weave-embed';

const vectorStore = new VectorStore();

// Add nodes
await vectorStore.addNodeEmbedding('n1', 'Authentication', 'User login system');
await vectorStore.addNodeEmbedding('n2', 'Database', 'User database storage');

// Search
const results = await vectorStore.searchSimilar('user authentication', 5);
console.log(results[0]); // { nodeId, nodeLabel, similarity, distance }
```

### Hybrid Search (Semantic + Structural)

```typescript
import { HybridSearch } from '@openweave/weave-embed';

const hybridSearch = new HybridSearch(vectorStore);

// Set graph structure for structural scoring
hybridSearch.setGraphNodes([
  {
    id: 'n1',
    label: 'Authentication',
    type: 'CLASS',
    relatedNodeIds: ['n2'],
    frequency: 10,
  },
  // ... more nodes
]);

// Perform hybrid search
const results = await hybridSearch.search({
  text: 'authentication',
  topK: 5,
  threshold: 0.3,
  weights: { semantic: 0.7, structural: 0.3 },
});

console.log(results[0]);
// {
//   nodeId: 'n1',
//   nodeLabel: 'Authentication',
//   semanticScore: 0.85,
//   structuralScore: 0.72,
//   combinedScore: 0.81,
//   explanation: '...'
// }
```

## API Reference

### EmbeddingService

```typescript
class EmbeddingService {
  // Initialize the embedding pipeline
  async initialize(): Promise<void>;

  // Embed single text
  async embed(text: string): Promise<TextEmbedding>;

  // Embed multiple texts
  async embedBatch(texts: string[]): Promise<TextEmbedding[]>;

  // Calculate cosine similarity
  cosineSimilarity(embedding1: number[], embedding2: number[]): number;

  // Calculate Euclidean distance
  euclideanDistance(embedding1: number[], embedding2: number[]): number;

  // Clear embedding cache
  clearCache(): void;

  // Get configuration
  getConfig(): EmbeddingConfig;
}
```

### VectorStore

```typescript
class VectorStore {
  // Add single node embedding
  async addNodeEmbedding(
    nodeId: string,
    nodeLabel: string,
    text: string,
    modelVersion?: string
  ): Promise<NodeEmbedding>;

  // Add batch of embeddings
  async addNodeEmbeddingsBatch(
    nodes: Array<{ nodeId; nodeLabel; text }>,
    modelVersion?: string
  ): Promise<NodeEmbedding[]>;

  // Search for similar nodes
  async searchSimilar(
    text: string,
    topK?: number,
    threshold?: number
  ): Promise<SimilarityResult[]>;

  // Get node embedding
  getNodeEmbedding(nodeId: string): NodeEmbedding | undefined;

  // Check if has embedding
  hasEmbedding(nodeId: string): boolean;

  // Remove node embedding
  removeNodeEmbedding(nodeId: string): boolean;

  // Get all node IDs
  getNodeIds(): string[];

  // Get statistics
  getStats(): EmbeddingStats;

  // Clear all embeddings
  clear(): void;

  // Export/import embeddings
  export(): Record<string, NodeEmbedding>;
  import(data: Record<string, NodeEmbedding>): void;
}
```

### HybridSearch

```typescript
class HybridSearch {
  // Set graph nodes for structural scoring
  setGraphNodes(nodes: GraphNode[]): void;

  // Perform hybrid search
  async search(query: SearchQuery): Promise<HybridSearchResult[]>;

  // Get vector store
  getVectorStore(): VectorStore;

  // Get graph nodes
  getGraphNodes(): Map<string, GraphNode>;
}
```

## Configuration

### EmbeddingService Config

```typescript
interface EmbeddingConfig {
  modelName: string;           // Default: 'Xenova/all-MiniLM-L6-v2'
  dimension: number;           // Default: 384
  pooling: 'mean' | 'max' | 'cls';  // Default: 'mean'
  normalize: boolean;          // Default: true
  batchSize: number;          // Default: 32
  maxSequenceLength: number;  // Default: 512
}
```

### SearchQuery Options

```typescript
interface SearchQuery {
  text: string;
  topK: number;
  threshold?: number;          // Minimum similarity (0-1)
  useStructuralSearch?: boolean;  // Default: true
  weights?: {
    semantic: number;  // Default: 0.7
    structural: number; // Default: 0.3
  };
}
```

## Scoring Algorithm

### Semantic Score
- Uses cosine similarity between embeddings (0-1 range)
- Same for all search types

### Structural Score
Components:
- **Frequency**: Node reference count (0-0.6)
- **Connectivity**: Number of graph relationships (0-0.3)
- **Type Boost**: Knowledge-based boost by node type (0-0.1)
  - CLASS: +0.10
  - FUNCTION: +0.08
  - INTERFACE: +0.08
  - DECISION: +0.07
  - CONCEPT: +0.06
  - Other types: +0.02-0.05

### Combined Score
```
combinedScore = semantic_weight × semanticScore + structural_weight × structuralScore
```

## Models

Default: **Xenova/all-MiniLM-L6-v2**
- Dimension: 384
- Size: ~27MB
- Performance: Fast, good semantic understanding
- No external API required

Alternative options (compatible):
- `Xenova/all-mpnet-base-v2` (768 dimension, better quality)
- `Xenova/DistilBERT-base` (768 dimension)

## Performance Characteristics

- **Initialization**: ~1-2 seconds (model loading)
- **Single Embedding**: ~10-50ms
- **Batch Embedding**: ~5-10ms per text
- **Search**: ~1-5ms per query (100 nodes)
- **Memory**: ~2MB for embeddings cache + model (~27MB)

## Integration with WeaveGraph

```typescript
import { WeaveGraph } from '@openweave/weave-graph';
import { HybridSearch } from '@openweave/weave-embed';

const graph = new WeaveGraph({ chatId: 'user-123' });
const hybridSearch = new HybridSearch();

// Extract nodes from graph
const graphNodes = graph.getNodes().map(node => ({
  id: node.id,
  label: node.label,
  type: node.type,
  relatedNodeIds: graph.getEdges()
    .filter(e => e.sourceId === node.id)
    .map(e => e.targetId),
  frequency: node.frequency || 1,
}));

// Add to hybrid search
hybridSearch.setGraphNodes(graphNodes);

// Use for intelligent search
const results = await hybridSearch.search({
  text: 'authentication',
  topK: 10,
  threshold: 0.3,
});
```

## Testing

```bash
pnpm test
```

Includes 30+ comprehensive tests covering:
- Embedding service initialization and caching
- Vector store operations
- Similarity search and filtering
- Hybrid search with weights
- Import/export functionality
- Integration workflows

## Benchmarks

On typical project (100 nodes):
- Initial embedding: ~100-200ms
- Search query: ~2-5ms
- Memory usage: ~3-5MB

## License

Apache-2.0 - See LICENSE file
