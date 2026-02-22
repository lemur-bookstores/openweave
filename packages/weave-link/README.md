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

## Quick Start

```python
from weave_graph import ContextGraphManager, NodeType, EdgeType

# Initialize for a session
graph = ContextGraphManager(chat_id="proj_abc123")

# Add a decision node
decision = graph.add_node(
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