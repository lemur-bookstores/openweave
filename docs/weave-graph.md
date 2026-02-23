# 🧠 WeaveGraph — API Reference

> `@openweave/weave-graph` — the knowledge graph engine at the heart of OpenWeave.
> Handles node and edge management, semantic retrieval, neuronal linking,
> Hebbian weight dynamics, context compression, and pluggable persistence.

---

## Installation

WeaveGraph is a workspace package — no separate install needed within the monorepo.
For standalone use:

```bash
pnpm add @openweave/weave-graph
```

---

## Quick Start

```typescript
import {
  ContextGraphManager,
  NodeBuilder,
  EdgeBuilder,
  SynapticEngine,
  HebbianWeights,
} from "@openweave/weave-graph";

// Create a graph for a session
const graph = new ContextGraphManager("session-001");

// Enable neuronal retroactive linking
graph.setSynapticEngine(new SynapticEngine({ threshold: 0.72 }));

// Enable Hebbian weight strengthening
graph.setHebbianWeights(new HebbianWeights({ decayRate: 0.99 }));

// Add nodes
graph.addNode(NodeBuilder.concept("TypeScript generics", "Type parameter constraints"));
graph.addNode(NodeBuilder.decision("Use generics over union types", "Better type inference"));

// Query
const results = graph.queryNodesByLabel("typescript");
```

---

## ContextGraphManager

### Constructor

```typescript
new ContextGraphManager(chatId: string, compressionThreshold?: number)
```

| Parameter | Default | Description |
|---|---|---|
| `chatId` | — | Unique session identifier |
| `compressionThreshold` | `0.75` | Fill ratio (0–1) that triggers compression |

---

### Node Operations

#### `addNode(node: Node): Node`
Adds a node and fires synchronous retroactive linking if a `SynapticEngine` is attached.

```typescript
const node = graph.addNode(NodeBuilder.concept("dependency injection"));
```

#### `addNodeAsync(node: Node): Promise<Node>`
Adds a node and fires **embedding-based** retroactive linking (async).
Falls back to keyword-based linking if no `embeddingService` is configured.

```typescript
const node = await graph.addNodeAsync(NodeBuilder.concept("dependency injection"));
```

#### `getNode(nodeId: string): Node | undefined`
#### `updateNode(nodeId: string, updates: Partial<Node>): Node | undefined`
#### `deleteNode(nodeId: string): boolean`
#### `getAllNodes(): Node[]`

---

### Edge Operations

#### `addEdge(edge: Edge): Edge`
#### `getEdge(edgeId: string): Edge | undefined`
#### `updateEdge(edgeId: string, updates: Partial<Edge>): Edge | undefined`
#### `deleteEdge(edgeId: string): boolean`
#### `getAllEdges(): Edge[]`
#### `getEdgesForNode(nodeId: string, direction?: "source" | "target" | "both"): Edge[]`

---

### Query Operations

#### `queryNodesByLabel(term: string, limit?: number): Node[]`
Keyword search over node labels. When `HebbianWeights` is attached, co-activated
result nodes automatically have their connecting edges strengthened.

```typescript
const nodes = graph.queryNodesByLabel("generics", 10);
```

#### `queryNodesByType(type: NodeType, limit?: number): Node[]`
Filter nodes by type. Also triggers Hebbian co-activation.

```typescript
import { NodeType } from "@openweave/weave-graph";
const errors = graph.queryNodesByType(NodeType.ERROR);
```

#### `queryRelatedNodes(nodeId: string, depth?: number): Node[]`
Graph traversal from a node up to a given depth.

---

### Neuronal Hooks

#### `setSynapticEngine(engine: SynapticEngine): void`
Attach a SynapticEngine. From this point, every `addNode()` call triggers
retroactive linking across the entire graph history.

#### `setHebbianWeights(hw: HebbianWeights): void`
Attach HebbianWeights. From this point, every query automatically strengthens
edges between co-activated result nodes.

---

### Compression

#### `shouldCompress(): boolean`
Returns `true` when the node count exceeds `compressionThreshold × maxNodes`.

#### `compress(): CompressionStats`
Archives low-priority nodes (low frequency, old timestamp) into a compact summary.

---

### Persistence

#### `save(provider: IWeaveProvider<GraphSnapshot>): Promise<void>`
#### `load(chatId: string, provider: IWeaveProvider<GraphSnapshot>): Promise<void>`
#### `getSnapshot(): GraphSnapshot`

---

## NodeBuilder

Fluent factory for creating typed nodes with auto-generated UUIDs.

```typescript
NodeBuilder.concept(label: string, description?: string): Node
NodeBuilder.decision(label: string, description?: string): Node
NodeBuilder.error(label: string, description?: string): Node
NodeBuilder.correction(label: string, description?: string): Node
NodeBuilder.milestone(label: string, description?: string): Node
NodeBuilder.codeEntity(label: string, description?: string): Node
NodeBuilder.clone(node: Node, overrides?: Partial<Node>): Node
```

---

## EdgeBuilder

```typescript
EdgeBuilder.relates(sourceId: string, targetId: string, weight?: number): Edge
EdgeBuilder.causes(sourceId: string, targetId: string): Edge
EdgeBuilder.blocks(sourceId: string, targetId: string): Edge
EdgeBuilder.corrects(sourceId: string, targetId: string): Edge
EdgeBuilder.implements(sourceId: string, targetId: string): Edge
EdgeBuilder.dependsOn(sourceId: string, targetId: string): Edge
```

---

## SynapticEngine

Retroactive neuronal linking — connects new knowledge to relevant history automatically.

### Constructor

```typescript
new SynapticEngine(options?: SynapticOptions)
```

```typescript
interface SynapticOptions {
  threshold?: number;                           // default: 0.72
  maxConnections?: number;                      // default: 20
  embeddingService?: SynapticEmbeddingService;  // optional: enables cosine mode
}
```

### Methods

#### `linkRetroactively(newNode: Node, graph: SynapticGraph): Edge[]`
Synchronous keyword-based linking (Jaccard similarity).
Called automatically by `addNode()` when engine is attached.

#### `async linkRetroactivelyEmbedding(newNode: Node, graph: SynapticGraph): Promise<Edge[]>`
Async cosine-similarity-based linking.
Called automatically by `addNodeAsync()` when engine is attached.
Falls back to `linkRetroactively()` if no `embeddingService` is configured.

### Properties

| Property | Type | Description |
|---|---|---|
| `config` | object | `{ threshold, maxConnections, hasEmbeddings }` |
| `hasEmbeddingService` | `boolean` | True when an embedding service is configured |

### Edge metadata

Synaptic edges carry:
```typescript
{
  type: "RELATES",
  weight: 0.84,                 // similarity score
  metadata: {
    synapse: true,
    similarity: 0.84,
    mode: "keyword" | "embedding"
  }
}
```

### Standalone helpers

```typescript
tokenize(text: string): Set<string>
// Splits camelCase/PascalCase, filters stop-words, normalises to lowercase
// "TypeScript generics" → Set { "type", "script", "generics" }

jaccardSimilarity(a: Set<string>, b: Set<string>): number
// J(A,B) = |A∩B| / |A∪B|

cosineSimilarity(a: number[], b: number[]): number
// cos(θ) = A·B / (|A| × |B|)
```

---

## HebbianWeights

Hebbian learning dynamics for edges — "neurons that fire together, wire together."

### Constructor

```typescript
new HebbianWeights(options?: HebbianOptions)
```

```typescript
interface HebbianOptions {
  hebbianStrength?: number;   // weight increment per activation  (default: 0.1)
  decayRate?: number;         // weight × decayRate per cycle     (default: 0.99)
  pruneThreshold?: number;    // minimum weight before deletion   (default: 0.05)
  maxWeight?: number;         // upper cap                        (default: 5.0)
}
```

### Methods

#### `strengthen(edgeId: string, graph: HebbianGraph): Edge | undefined`
Increment the weight of a single edge by `hebbianStrength`, capped at `maxWeight`.

#### `strengthenCoActivated(nodeIds: string[], graph: HebbianGraph): string[]`
Batch-strengthen all edges whose source **and** target are both in `nodeIds`.
Returns the list of edge IDs that were strengthened.

Called automatically by `queryNodesByLabel()` and `queryNodesByType()`.

#### `decay(graph: HebbianGraph): number`
Apply `weight × decayRate` to **all** edges in the graph.
Returns the number of edges processed.

#### `prune(graph: HebbianGraph, minWeight?: number): number`
Delete all edges whose weight is below `pruneThreshold` (or the override).
Returns the number of edges deleted.

### Properties

| Property | Type |
|---|---|
| `config` | `Required<HebbianOptions>` |

---

## Types Reference

```typescript
type NodeType = "CONCEPT" | "DECISION" | "ERROR" | "CORRECTION" | "MILESTONE" | "CODE_ENTITY";
type EdgeType = "RELATES" | "CAUSES" | "BLOCKS" | "CORRECTS" | "IMPLEMENTS" | "DEPENDS_ON";

interface Node {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  frequency: number;
  archived: boolean;
}

interface Edge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  weight: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
```

---

## Provider Integration

WeaveGraph's `PersistenceManager` accepts any `IWeaveProvider<GraphSnapshot>`:

```typescript
import { PersistenceManager } from "@openweave/weave-graph";
import { SqliteProvider } from "@openweave/weave-provider-sqlite";

const provider = new SqliteProvider({ path: "./graph.db" });
const persistence = new PersistenceManager(provider);

// Save
await persistence.save("session-001", graph.getSnapshot());

// Load
const snapshot = await persistence.load("session-001");
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WEAVE_SYNAPSE_THRESHOLD` | `0.72` | Default Jaccard threshold for SynapticEngine |
| `WEAVE_SYNAPSE_MAX_CONNECTIONS` | `20` | Default max retroactive edges per node |
| `WEAVE_PROVIDER` | `json` | Storage backend (`json \| sqlite \| mongodb \| postgres \| mysql`) |
