# 🧵 OpenWeave

### *Weaving context into intelligence*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Tests](https://img.shields.io/badge/tests-923%20passing-brightgreen.svg)](ROADMAP.md)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2)](https://discord.gg/openweave)
[![Documentation](https://img.shields.io/badge/docs-openweave.dev-blue)](https://openweave.dev)

**OpenWeave is an open-source AI agent that thinks like a senior developer.**  
It weaves context, memory, and knowledge into a coherent graph — staying focused,
methodical, and free of orphan code across every session.

[Getting Started](#-getting-started) · [Architecture](#-architecture) · [Packages](#-packages) · [Contributing](#-contributing) · [Community](#-community)

---

## 🤔 Why OpenWeave?

Most AI coding agents suffer from the same fundamental problems:

| Problem | What agents do | What OpenWeave does |
|---|---|---|
| **Context amnesia** | Forget decisions made 10 messages ago | Compresses context into a persistent knowledge graph |
| **Orphan code** | Generate functions nobody calls | Validates every entity has a traceable caller before output |
| **Error repetition** | Repeat the same mistake in different words | Suppresses flagged errors and learns from corrections |
| **Chaotic execution** | Jump between tasks without a plan | Decomposes every task into milestones → sub-tasks |
| **Lost sessions** | Start from zero every conversation | Persists full project context by `chat_id` |

OpenWeave is built on a single principle: **a senior developer doesn't just generate code — they reason, relate, plan, and remember.**

---

## ✨ Key Features

- 🧠 **WeaveGraph Memory** — Context stored as a semantic graph, not flat text. Nodes for concepts, decisions, errors and corrections. Edges for causal and structural relationships.
- 🗜️ **Smart Context Compression** — When the context window fills up, OpenWeave grafizes it into key nodes and edges instead of truncating or summarizing blindly.
- 🔍 **Long-Term Memory Retrieval** — Searches prior sessions by `chat_id` to bring relevant knowledge into the active context automatically. Supports semantic (cosine) and hybrid search via `weave-embed`.
- ❌ **Error Suppression & Correction Nodes** — User-flagged errors are suppressed, linked to their correction, and stored in a dedicated error pattern registry.
- 🗺️ **WeavePath Planning** — Every task is decomposed into Epics → Milestones → Sub-tasks. The agent advances one sub-task at a time and confirms before moving forward.
- 🔬 **WeaveLint** — Static AST analysis that detects orphan code (unreferenced functions, classes, methods) before output is delivered.
- 🔌 **WeaveLink MCP Server** — Full Model Context Protocol support for integration with Claude, Cursor, Cline and any MCP-compatible client. Supports both stdio and HTTP transport with Bearer API-key auth.
- 🧩 **Skill Modules System** — 15 optional developer skills (auto-fix, code-review, test-gen, docs-gen, refactor, pipeline-aware, dep-audit, onboarding, commit-composer, and more). Each skill is independently enabled via `weave skills enable <id>` or `.weave.config.json`.
- 🔧 **External Tool Registry** — Register any REST API, MCP server, or local script as a native tool via `weave tools add`. Supports HTTP (bearer/api-key/basic), MCP (JSON-RPC 2.0), and script adapters. Tools are prefixed `<id>__<action>` to avoid collisions.
- 🧬 **SynapticEngine** — Retroactive neuronal linking on every `addNode()` / `addNodeAsync()` call. Uses Jaccard keyword similarity (sync) or cosine embedding similarity (async) to auto-create `RELATES` edges across the entire graph history — just like synaptic connections forming through time.
- ⚡ **Hebbian Weights** — "Neurons that fire together, wire together". Edges strengthen on co-activation, decay over time, and are pruned below a configurable threshold — emergent importance scoring with zero extra config.
- 🔌 **Pluggable Provider System** — Storage is a configuration decision, not an architecture constraint. Swap between JSON, SQLite, MongoDB, PostgreSQL, or MySQL with a single env var (`WEAVE_PROVIDER`).
- 🖥️ **Weave Dashboard** — D3-powered graph visualizer with Kanban milestone board, error registry, and session diff view.
- 📊 **WeaveCheck Eval Suite** — Measurable quality KPIs: orphan rate, graph coherence, error repetition, milestone adherence, compression quality.
- 📁 **Session Persistence** — Auto-generated `roadmap.md`, `decisions.md`, and `errors.md` per project session.

---

## 🏗️ Architecture

```
openweave/
├── apps/
│   ├── agent-core/              # 🤖 Main OpenWeave Agent (ReAct loop + orchestration)
│   ├── weave-cli/               # ⌨️  CLI tool — interact with OpenWeave from terminal
│   └── weave-dashboard/         # 🖥️  Web UI — graph visualizer, milestones & sessions
│
├── packages/
│   ├── weave-graph/             # 🧠 WeaveGraph — knowledge graph engine & memory manager
│   │                            #    └─ SynapticEngine (retroactive linking)
│   │                            #    └─ HebbianWeights (co-activation strengthening)
│   ├── weave-embed/             # 🔢 Embeddings — vector store + hybrid search
│   ├── weave-lint/              # 🔬 WeaveLint — orphan code detector (AST analysis)
│   ├── weave-path/              # 🗺️  WeavePath — milestone & sub-task planner
│   ├── weave-link/              # 🔌 WeaveLink — MCP server (stdio + HTTP transport)
│   ├── weave-check/             # 📊 WeaveCheck — eval suite & QA KPI framework
│   ├── weave-skills/            # 🧩 Skill Modules — auto-fix, code-review, test-gen, docs-gen…
│   ├── weave-tools/             # 🔧 External Tool Registry — HTTP/MCP/script adapters
│   ├── weave-provider/          # 🔌 Provider contract — IWeaveProvider<T> interface
│   ├── weave-provider-sqlite/   # 🗄️  SQLite provider (node:sqlite built-in)
│   ├── weave-provider-mongodb/  # 🍃 MongoDB provider
│   ├── weave-provider-postgres/ # 🐘 PostgreSQL provider (PGlite compatible)
│   └── weave-provider-mysql/    # 🐬 MySQL / MariaDB provider
│
├── docs/                        # 📚 Documentation site source
├── scripts/                     # 🛠️  Dev scripts (setup, release, etc.)
└── .github/                     # ⚙️  CI/CD, issue templates, PR templates
```

### How the Memory Graph Works

```
  ┌─────────────────────────────────────────────────────────┐
  │                  SESSION CONTEXT FLOW                   │
  │                                                         │
  │  User message                                           │
  │       │                                                 │
  │       ▼                                                 │
  │  ┌─────────────┐    75% full?    ┌──────────────────┐  │
  │  │ Short-Term  │ ─────────────►  │  Grafize Context │  │
  │  │   Memory    │                 │  (compress→graph)│  │
  │  │  (window)   │◄────────────    └────────┬─────────┘  │
  │  └──────┬──────┘  inject summary          │            │
  │         │                                 ▼            │
  │         │                        ┌──────────────────┐  │
  │         │ query relevant         │   WeaveGraph     │  │
  │         └───────────────────►    │  (Long-Term DB)  │  │
  │                                  │                  │  │
  │                                  │ [concept]─►[dec] │  │
  │                                  │     │       │    │  │
  │                                  │  [error]◄─[fix]  │  │
  │                                  └──────────────────┘  │
  └─────────────────────────────────────────────────────────┘
```

---

## 📦 Packages

### Core

| Package | Description | Tests | Status |
|---|---|---|---|
| [`weave-graph`](packages/weave-graph) | Knowledge graph engine — nodes, edges, compression, SynapticEngine, HebbianWeights | 116 | 🚧 Alpha |
| [`weave-embed`](packages/weave-embed) | Embedding service, vector store, hybrid semantic+structural search | 67 | 🚧 Alpha |
| [`weave-lint`](packages/weave-lint) | AST-based orphan code detector for Python and TypeScript | 22 | 🚧 Alpha |
| [`weave-path`](packages/weave-path) | Hierarchical milestone planner with persistence and status tracking | 19 | 🚧 Alpha |
| [`weave-link`](packages/weave-link) | MCP server — stdio + HTTP transport, API-key auth, Claude/Cursor installer | 102 | 🚧 Alpha |
| [`weave-check`](packages/weave-check) | Evaluation suite — 5 KPI evaluators, `WeaveCheckRunner`, shared provider contract tests | 60 | 🚧 Alpha |
| [`weave-skills`](packages/weave-skills) | Skill Modules System — auto-fix, code-review, test-gen, docs-gen, refactor, pipeline-aware, dep-audit, onboarding, commit-composer, context-memory, multi-repo, cli-interactive | 177 | ✅ Stable |
| [`weave-tools`](packages/weave-tools) | External Tool Registry — HTTP/MCP/script adapters, `ToolStore`, `ExternalToolBridge`, `validateManifest` | 61 | ✅ Stable |

### Provider System

| Package | Description | Tests | Status |
|---|---|---|---|
| [`weave-provider`](packages/weave-provider) | Abstract persistence contract (`IWeaveProvider<T>`), `MemoryProvider`, `JsonProvider` | 45 | 🚧 Alpha |
| [`weave-provider-sqlite`](packages/weave-provider-sqlite) | SQLite provider via `node:sqlite` built-in (zero native deps) | 23 | 🚧 Alpha |
| [`weave-provider-mongodb`](packages/weave-provider-mongodb) | MongoDB provider (`mongodb` v6) | 21 | 🚧 Alpha |
| [`weave-provider-postgres`](packages/weave-provider-postgres) | PostgreSQL provider — compatible with `pg` and PGlite (WASM) | 21 | 🚧 Alpha |
| [`weave-provider-mysql`](packages/weave-provider-mysql) | MySQL / MariaDB provider (`mysql2`) | 21 | 🚧 Alpha |

### Apps

| App | Description | Tests | Status |
|---|---|---|---|
| [`agent-core`](apps/agent-core) | OpenWeave ReAct agent — system prompt, tool registry, context manager, session lifecycle | 61 | 🚧 Alpha |
| [`weave-cli`](apps/weave-cli) | CLI — `init`, `status`, `milestones`, `query`, `orphans`, `errors`, `save-node`, `migrate`, `skills`, `tools` | 35 | ✅ Stable |
| [`weave-dashboard`](apps/weave-dashboard) | D3 graph SPA — 4 views: graph, milestone board, error registry, session diff | 60 | 🚧 Alpha |

---

## 🚀 Getting Started

### Prerequisites

- Node.js **≥ 25.6.1** (uses `node:sqlite` built-in — requires Node 22.5+ for SQLite provider)
- `pnpm` v10+ (recommended) or `npm`

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/openweave/openweave.git
cd openweave

# 2. Install dependencies (all packages)
pnpm install

# 3. Set up your environment
cp .env.example .env
# Add your LLM API key to .env

# 4. Start the WeaveLink MCP server
pnpm --filter weave-link start

# 5. Run the CLI agent
pnpm --filter weave-cli start
```

### Use with Claude Desktop / Cursor / Cline

Add to your MCP config:

```json
{
  "mcpServers": {
    "openweave": {
      "command": "npx",
      "args": ["-y", "@openweave/weave-link"],
      "env": {
        "OPENWEAVE_STORAGE": "./openweave-sessions"
      }
    }
  }
}
```

---

## 🤝 Contributing

OpenWeave is built by and for the developer community. All contributions are welcome.

```bash
# Fork → Clone → Branch
git checkout -b feat/your-feature

# Make changes, then
pnpm test
pnpm lint

# Submit PR against `main`
```

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.  
All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md).

### Good First Issues

Look for issues tagged [`good first issue`](https://github.com/openweave/openweave/issues?q=label%3A%22good+first+issue%22) — these are specifically curated for new contributors.

### Roadmap

See [ROADMAP.md](ROADMAP.md) for the full development plan broken into phases.

### Documentation

| Guide | Description |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Installation, setup, first session |
| [docs/architecture.md](docs/architecture.md) | System architecture and package dependency graph |
| [docs/weave-graph.md](docs/weave-graph.md) | WeaveGraph API — nodes, edges, SynapticEngine, HebbianWeights |
| [docs/mcp-integration.md](docs/mcp-integration.md) | Connect Claude, Cursor, Cline via MCP |
| [docs/sentinel-agent.md](docs/sentinel-agent.md) | Security audits with the Sentinel agent |

---

## 🌐 Community

| Platform | Link |
|---|---|
| 💬 Discord | [discord.gg/openweave](https://discord.gg/openweave) |
| 🐦 Twitter/X | [@openweave_ai](https://twitter.com/openweave_ai) |
| 📖 Docs | [openweave.dev/docs](https://openweave.dev/docs) |
| 🗺️ Roadmap | [openweave.dev/roadmap](https://openweave.dev/roadmap) |

---

## 📄 License

OpenWeave is open source under the [MIT License](LICENSE).  
Built with ❤️ by the OpenWeave community.

---

*"A senior developer doesn't just generate code — they reason, relate, plan, and remember."*

**🧵 OpenWeave — Weaving context into intelligence**
