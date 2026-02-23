# 🏗️ OpenWeave Architecture

> A deep dive into how OpenWeave's packages interconnect, how memory flows
> through the system, and the design principles behind each layer.

---

## Core Principle

> **A senior developer doesn't just generate code — they reason, relate, plan, and remember.**

Every architectural decision in OpenWeave stems from this principle. The system is
designed to be stateful, relational, and self-auditing.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          OpenWeave                                  │
│                                                                     │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────────┐  │
│  │ SHORT-TERM   │◄──►│    CONTEXT    │◄──►│    LONG-TERM         │  │
│  │  MEMORY      │    │    MANAGER    │    │    MEMORY            │  │
│  │  (Window)    │    │  (Monitor)    │    │  (WeaveGraph + DB)   │  │
│  └──────┬───────┘    └──────┬────────┘    └──────────┬───────────┘  │
│         │                  │                         │              │
│         ▼                  ▼                         ▼              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  KNOWLEDGE GRAPH ENGINE                       │  │
│  │          (ContextGraphManager + SynapticEngine)               │  │
│  │                                                               │  │
│  │   [concept] ──relates──► [concept]                            │  │
│  │       │                       │                               │  │
│  │    causes                  blocks                             │  │
│  │       │                       │                               │  │
│  │   [decision] ◄──corrects── [ERROR NODE]                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│         ┌────────────────────┼──────────────────┐                   │
│         ▼                    ▼                  ▼                   │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────┐          │
│  │  MILESTONE  │   │  CODE VALIDATOR │   │   PROVIDER   │          │
│  │   PLANNER   │   │ (Orphan Detect) │   │   SYSTEM     │          │
│  │ (WeavePath) │   │  (WeaveLint)    │   │ (Storage)    │          │
│  └─────────────┘   └─────────────────┘   └──────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Package Dependency Graph

```
agent-core
  ├── weave-graph        ← core memory engine
  ├── weave-path         ← milestone planning
  ├── weave-lint         ← orphan detection
  └── weave-link         ← MCP server interface
        ├── weave-graph
        ├── weave-path
        └── weave-lint

weave-graph
  ├── weave-provider     ← storage contract (IWeaveProvider<T>)
  └── [SynapticEngine]   ← retroactive linking (self-contained)
  └── [HebbianWeights]   ← edge strengthening (self-contained)

weave-embed              ← independent — no deps on graph
  └── @xenova/transformers

weave-check
  └── weave-provider     ← shared contract test suite

weave-provider-sqlite  ─┐
weave-provider-mongodb ─┤ all implement IWeaveProvider<T>
weave-provider-postgres─┤
weave-provider-mysql   ─┘
```

---

## Layer Breakdown

### Layer 1 — Memory Graph (`weave-graph`)

The heart of OpenWeave. A typed, indexed, in-memory graph with optional persistence.

**Key classes:**

| Class | Responsibility |
|---|---|
| `ContextGraphManager` | Main graph — CRUD for nodes/edges, queries, compression |
| `SynapticEngine` | Retroactive linking via Jaccard (sync) or cosine (async) |
| `HebbianWeights` | Edge weight strengthening, temporal decay, pruning |
| `PersistenceManager` | Serialise/deserialise graph snapshots via `IWeaveProvider<T>` |
| `CompressionManager` | Archives low-priority nodes when context window fills |
| `ErrorSuppression` | Links ERROR nodes to CORRECTION nodes |

**Node types:** `CONCEPT · DECISION · ERROR · CORRECTION · MILESTONE · CODE_ENTITY`

**Edge types:** `RELATES · CAUSES · BLOCKS · CORRECTS · IMPLEMENTS · DEPENDS_ON`

**Neuronal behaviour:**
```
addNode(n)  →  SynapticEngine.linkRetroactively(n, graph)
                    ↓ Jaccard keyword similarity
                 creates RELATES edges to all historically relevant nodes

addNodeAsync(n) →  SynapticEngine.linkRetroactivelyEmbedding(n, graph)
                    ↓ cosine similarity (if embeddingService configured)
                    ↓ fallback to Jaccard (if no embeddingService)
                 creates RELATES edges with metadata.mode: "embedding"|"keyword"

queryNodesByLabel(q) → HebbianWeights.strengthenCoActivated(resultIds, graph)
                        → co-activated edges strengthen automatically
```

---

### Layer 2 — Semantic Memory (`weave-embed`)

Vector store for embedding-based retrieval. Fully independent of `weave-graph` —
no circular dependency.

```
EmbeddingService         ← wraps @xenova/transformers (local, no API key)
  └── embed(text)        → number[]
  └── cosineSimilarity() → number
  └── embeddingCache     → Map<string, number[]>

VectorStore              ← persists embeddings per node
  └── upsert(nodeId, embedding)
  └── search(query, topK) → SimilarityResult[]

HybridSearch             ← combines semantic + structural scores
  └── search(query, weights: { semantic, structural })
```

**Integration with SynapticEngine (M18):**
`EmbeddingService` satisfies the duck-typed `SynapticEmbeddingService` interface
without any import coupling:
```typescript
const engine = new SynapticEngine({
  embeddingService: new EmbeddingService()  // ← zero coupling, just duck-typing
});
```

---

### Layer 3 — Planning (`weave-path`)

Hierarchical task decomposition that mirrors how a senior developer thinks about work.

```
Epic
  └── Phase
        └── Milestone
              └── SubTask  ← the atomic unit of work
```

**Status propagation:** SubTask statuses aggregate upward automatically.
A Milestone becomes COMPLETED only when all non-DEFERRED sub-tasks are COMPLETED.

**Next action resolver:** Two-phase algorithm —
1. Find the first IN_PROGRESS milestone with an available sub-task
2. Fall back to the highest-priority NOT_STARTED milestone

---

### Layer 4 — Code Validation (`weave-lint`)

Static AST analysis that detects orphan code before it reaches output.

```
TypeScriptAnalyzer    ← ts-morph based; finds functions/classes/interfaces/types
PythonAnalyzer        ← ast-grep based; finds def/class/variable declarations
OrphanDetector        ← two-phase: entity discovery → usage mapping
  └── detect(files)  → OrphanReport { CRITICAL | HIGH | MEDIUM | LOW }
```

Severity classification:
- **CRITICAL** — exported symbol with no external usage
- **HIGH** — function defined but never called
- **MEDIUM** — class with no instantiation
- **LOW** — variable assigned but only read once

---

### Layer 5 — MCP Server (`weave-link`)

Exposes all OpenWeave capabilities as MCP tools. Supports two transport modes:

```
WeaveLinkServer
  ├── stdio transport   ← for Claude Desktop, Cursor, Cline (default)
  └── HttpTransport     ← REST + SSE; CORS-enabled for dashboard

AuthManager             ← Bearer token / X-API-Key; enable/disable at runtime
ConfigGenerator         ← generates mcpServers JSON for any client

Tools exposed:
  save_node · query_graph · suppress_error · update_roadmap
  get_session_context · get_next_action · list_orphans
```

---

### Layer 6 — Provider System (`weave-provider`)

Storage is a **configuration decision**, not an architecture constraint.

```
IWeaveProvider<T>
  get(key): T | undefined
  set(key, value): void
  delete(key): boolean
  list(prefix?): string[]
  clear(prefix?): void
  close(): void
```

All providers are **interchangeable** and tested against the same shared contract
suite (`runProviderContractTests()` in `weave-check`):

| Provider | Backend | Use case |
|---|---|---|
| `MemoryProvider` | `Map<>` | Tests, ephemeral sessions |
| `JsonProvider` | JSON files | Default, zero config |
| `SqliteProvider` | `node:sqlite` built-in | CLI, desktop apps |
| `MongoProvider` | `mongodb` v6 | Document store |
| `PostgresProvider` | `pg` / PGlite | Relational, WASM-compatible |
| `MysqlProvider` | `mysql2` | MySQL / MariaDB |

**Switching providers:**
```bash
WEAVE_PROVIDER=sqlite node app.js
```

**Migration:**
```bash
weave migrate --from json --to sqlite --dry-run
weave migrate --from json --to sqlite
```

---

### Layer 7 — Agent Core (`agent-core`)

The ReAct orchestrator that uses all packages together.

```
AgentCore  (ReAct loop: Thought → Action → Observation → repeat)
  ├── SystemPromptBuilder  ← injects live graph context into system prompt
  ├── ToolRegistry         ← 7 canonical tools + runtime registration
  ├── ContextManager       ← token budget, 75% compression trigger
  └── SessionLifecycle     ← JSON persistence per chat_id
```

**ReAct loop:**
```
User message
    ↓
SystemPrompt (with live graph context)
    ↓
LLM reasoning (Thought)
    ↓
Tool call  → ToolRegistry.execute()  → WeaveLink handler
    ↓
Observation injected back into context
    ↓
Repeat until final answer or maxTurns reached
```

---

### Layer 8 — Evaluation (`weave-check`)

Measurable quality KPIs with objective scores from 0–1:

| Evaluator | What it measures |
|---|---|
| `OrphanRateEvaluator` | % of unused exports (severity-weighted) |
| `GraphCoherenceEvaluator` | Dangling edges, isolated nodes, error coverage, density |
| `ErrorRepetitionEvaluator` | Same error seen in multiple sessions |
| `MilestoneAdherenceEvaluator` | Completion rate + hour accuracy |
| `CompressionQualityEvaluator` | High-freq node preservation + size reduction |

```typescript
const runner = new WeaveCheckRunner();
const report = await runner.run({ graph, milestones, orphanReport });
console.log(runner.formatReport(report));  // overall score: 0.87
```

---

## Data Flow — Complete Session

```
1. User opens session
   └── SessionLifecycle.init(chatId)
         └── resolveProvider()  →  picks backend from WEAVE_PROVIDER

2. User sends message
   └── AgentCore.run(message)
         ├── ContextManager.shouldCompress()?
         │     └── YES → CompressionManager.compress()
         │               └── graph.archiveNode() for low-priority nodes
         └── LLM.chat(systemPrompt + messages)

3. LLM calls a tool (e.g. save_node)
   └── ToolRegistry.execute("save_node", args)
         └── ContextGraphManager.addNode(node)
               ├── SynapticEngine.linkRetroactively(node, graph)
               └── HebbianWeights (if query later)

4. LLM calls query_graph
   └── ContextGraphManager.queryNodesByLabel(term)
         └── HebbianWeights.strengthenCoActivated(resultIds, graph)
               → edges between co-activated nodes get stronger

5. Session ends
   └── PersistenceManager.save(chatId)
         └── IWeaveProvider.set("graph:chatId", snapshot)
```

---

## Design Principles

### 1. Zero circular dependencies
All cross-package interactions use duck-typed interfaces (`SynapticGraph`,
`HebbianGraph`, `SynapticEmbeddingService`, `ProviderLike<T>`). No package
imports another package's concrete class — only its contract.

### 2. Zero breaking changes
Every new capability is **opt-in via injection**:
```typescript
graph.setSynapticEngine(engine)   // off by default
graph.setHebbianWeights(hw)       // off by default
graph.addNodeAsync(node)          // new entry point, addNode() unchanged
```

### 3. Zero mandatory external dependencies
- `node:sqlite` — built-in, no native compilation
- `@xenova/transformers` — local ML model, no API key
- All remote providers are optional peerDependencies

### 4. Testability first
Every class is designed with injection in mind. Integration tests use in-memory
fakes. The shared contract suite (`runProviderContractTests`) ensures behavioural
parity across all storage backends.
