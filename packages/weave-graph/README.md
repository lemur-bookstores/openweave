# 🧠 weave-graph

> **WeaveGraph** — The knowledge graph engine at the heart of OpenWeave.

Part of the [OpenWeave](../../README.md) monorepo.

---

## What it does

WeaveGraph manages all memory for an OpenWeave session:

- Stores **concepts, decisions, errors and corrections** as typed graph nodes
- Connects them with **semantic edges** (relates, causes, corrects, implements, depends_on)
- **Compresses context** into the graph when the LLM window reaches 75% capacity
- **Retrieves relevant nodes** from long-term memory given a query
- **Persists everything** to disk by `chat_id`, survives across sessions

## Node Types

| Type | Description |
|---|---|
| `CONCEPT` | A key idea or term in the project |
| `DECISION` | An architectural or implementation decision |
| `MILESTONE` | A planned deliverable |
| `ERROR` | A response flagged as incorrect by the user (suppressed) |
| `CORRECTION` | The correct version linked to an ERROR node |
| `CODE_ENTITY` | A function, class, or module created during the session |

## Edge Types

| Relation | Meaning |
|---|---|
| `RELATES` | General semantic relationship |
| `CAUSES` | A causes B |
| `CORRECTS` | A is the correction of B (B is an ERROR node) |
| `IMPLEMENTS` | A implements B (code → decision) |
| `DEPENDS_ON` | A depends on B |
| `BLOCKS` | A blocks B |

---

## SynapticEngine — Conexiones Neuronales Retroactivas

El `SynapticEngine` (en desarrollo — M16) da a WeaveGraph su comportamiento neuronal.
Cada nodo nuevo que entra al grafo es comparado contra **toda la historia**,
sin importar cuándo fue creado el nodo existente.

### Tres comportamientos (roadmap)

| Comportamiento | Módulo | Descripción |
|---|---|---|
| **Retroactive Linking** | `synaptic-engine.ts` | Al insertar un nodo, descubre y crea edges con nodos históricos relevantes |
| **Hebbian Strengthening** | `hebbian-weights.ts` | Edges cuyos nodos son recuperados juntos aumentan su peso (`+0.1`) |
| **Temporal Decay** | `hebbian-weights.ts` | Edges inactivos se debilitan gradualmente (`× 0.99` por ciclo) |

### Estructura de módulos (v0.8.0)

```
packages/weave-graph/src/
├── index.ts               ← ContextGraphManager (existente)
├── node.ts                ← NodeBuilder (existente)
├── edge.ts                ← EdgeBuilder (existente)
├── compression.ts         ← CompressionManager (existente)
├── persistence.ts         ← PersistenceManager (existente)
├── synaptic-engine.ts     ← Retroactive linking (M16 — en desarrollo)
└── hebbian-weights.ts     ← Strengthening + decay (M17 — planificado)
```

### Umbrales por defecto

| Variable de entorno | Default | Descripción |
|---|---|---|
| `WEAVE_SYNAPSE_THRESHOLD` | `0.72` | Similitud mínima para crear un edge retroactivo |
| `WEAVE_SYNAPSE_MAX_CONNECTIONS` | `20` | Máximo de edges automáticos por nodo |
| `WEAVE_HEBBIAN_STRENGTH` | `0.1` | Incremento de `edge.weight` por co-activación |
| `WEAVE_DECAY_RATE` | `0.99` | Factor de decay aplicado por ciclo inactivo |
| `WEAVE_PRUNE_THRESHOLD` | `0.05` | Weight mínimo antes de eliminar el edge |

### Uso (preview API)

```typescript
import { SynapticEngine, ContextGraphManager, NodeBuilder } from "@openweave/weave-graph";

const graph = new ContextGraphManager("chat_abc123");
const synapse = new SynapticEngine({ threshold: 0.72, maxConnections: 20 });

// Nodo histórico (creado hace un mes, ya en el grafo)
graph.addNode(NodeBuilder.concept("TypeScript generics", "Parametric polymorphism"));

// Nodo nuevo — SynapticEngine crea automáticamente el edge retroactivo
const newNode = NodeBuilder.concept("Generic constraints en TS", "extends keyword");
const newEdges = await synapse.linkRetroactively(newNode, graph);
// → crea edge RELATES entre ambos nodos aunque el primero tenga 1 mes de antigüedad

graph.addNode(newNode);
console.log(`${newEdges.length} conexiones retroactivas creadas`);
```

> **Estado:** `SynapticEngine` está en desarrollo activo en la rama `feature/synaptic-engine`.
> La API puede cambiar antes del release `v0.8.0`.

---

## Quick Start

### TypeScript / Node.js

```typescript
import {
  ContextGraphManager,
  NodeBuilder,
  EdgeBuilder,
  PersistenceManager,
  NodeType,
  EdgeType,
} from "@openweave/weave-graph";

// Initialize a graph for a session
const graph = new ContextGraphManager("chat_abc123");

// Create and add nodes
const concept = NodeBuilder.concept("TypeScript", "A typed superset of JavaScript");
const decision = NodeBuilder.decision("Use TypeScript for type safety");

graph.addNode(concept);
graph.addNode(decision);

// Connect nodes with edges
const edge = EdgeBuilder.relates(concept.id, decision.id);
graph.addEdge(edge);

// Query the graph
const results = graph.queryNodesByLabel("Type");
console.log(`Found ${results.length} nodes mentioning "Type"`);

// Get graph statistics
const stats = graph.getStats();
console.log(stats);
// {
//   totalNodes: 2,
//   totalEdges: 1,
//   nodesByType: { CONCEPT: 1, DECISION: 1 },
//   edgesByType: { RELATES: 1 },
//   chatId: "chat_abc123",
//   ...
// }

// Persist the graph
const persistence = new PersistenceManager("./weave-data");
await persistence.saveGraph(graph.snapshot());

// Load a previous session
const loaded = await persistence.loadOrCreateGraph("chat_abc123");
console.log(`Loaded graph with ${loaded.getAllNodes().length} nodes`);
```

### Available Node Types

- **CONCEPT** — A key idea or term
- **DECISION** — An architectural or implementation choice
- **MILESTONE** — A planned deliverable
- **ERROR** — A flagged incorrect response
- **CORRECTION** — The correct version of an ERROR
- **CODE_ENTITY** — A function, class, or module

### Available Edge Types

- **RELATES** — General semantic relationship
- **CAUSES** — A causes B
- **CORRECTS** — A corrects B (A is CORRECTION, B is ERROR)
- **IMPLEMENTS** — A implements B (code → decision)
- **DEPENDS_ON** — A depends on B
- **BLOCKS** — A blocks B

## API

### ContextGraphManager

```typescript
// Node operations
addNode(node: Node): Node
getNode(nodeId: string): Node | undefined
updateNode(nodeId: string, updates: Partial<Node>): Node | undefined
deleteNode(nodeId: string): boolean
getAllNodes(): Node[]

// Edge operations
addEdge(edge: Edge): Edge
getEdge(edgeId: string): Edge | undefined
updateEdge(edgeId: string, updates: Partial<Edge>): Edge | undefined
deleteEdge(edgeId: string): boolean
getAllEdges(): Edge[]
getEdgesFromNode(nodeId: string): Edge[]
getEdgesToNode(nodeId: string): Edge[]

// Queries
queryNodesByLabel(query: string): Node[]
queryNodesByType(type: NodeType): Node[]
queryEdgesByType(type: EdgeType): Edge[]

// Utilities
getStats(): GraphStats
snapshot(): GraphSnapshot
clear(): void
shouldCompress(): boolean
```

### PersistenceManager

```typescript
// File I/O
async saveGraph(snapshot: GraphSnapshot): Promise<void>
async loadGraph(chatId: string): Promise<GraphSnapshot | null>
async loadOrCreateGraph(chatId: string): Promise<ContextGraphManager>

// Session management
async graphExists(chatId: string): Promise<boolean>
async deleteGraph(chatId: string): Promise<void>
async listSessions(): Promise<SessionInfo[]>

// Configuration
setDataDir(newDataDir: string): void
getDataDir(): string
```

## Development

```bash
# Build
npm run build

# Test
npm run test

# Watch mode
npm run dev

# Lint
npm run lint

# Clean build artifacts
npm run clean
```
    content="Use PostgreSQL for persistence, not SQLite — project will scale",
    node_type=NodeType.DECISION,
    tags=["database", "architecture"]
)

# Add a concept and relate it
concept = graph.add_node(
    content="Session persistence by chat_id",
    node_type=NodeType.CONCEPT
)
graph.add_edge(decision.id, concept.id, EdgeType.RELATES)

# Suppress an error and record correction
graph.suppress_error_node(
    node_id=bad_response_node.id,
    correction_content="Use async/await, not threading — the codebase is fully async"
)

# Query relevant context before responding
relevant = graph.query_relevant_nodes("database connection pooling", top_k=5)

# Compress context when window is getting full
compressed_summary = graph.compress_context_to_graph(
    context_text=long_conversation_text,
    llm_extractor_fn=my_extraction_function
)
```

## Storage

All data is persisted to:
```
{storage_path}/{chat_id}/
├── context_graph.json    ← Full graph (nodes + edges)
├── roadmap.md            ← Human-readable milestone status
├── decisions.md          ← Decision log
└── errors.md             ← Error pattern registry
```

## Installation

```bash
pip install openweave-graph
# or within the monorepo:
pnpm --filter weave-graph dev
```