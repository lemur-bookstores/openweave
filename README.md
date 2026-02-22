# 🧵 OpenWeave

### *Weaving context into intelligence*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
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
- 🔍 **Long-Term Memory Retrieval** — Searches prior sessions by `chat_id` to bring relevant knowledge into the active context automatically.
- ❌ **Error Suppression & Correction Nodes** — User-flagged errors are suppressed, linked to their correction, and stored in a dedicated error pattern registry.
- 🗺️ **WeavePath Planning** — Every task is decomposed into Epics → Milestones → Sub-tasks. The agent advances one sub-task at a time and confirms before moving forward.
- 🔬 **WeaveLint** — Static AST analysis that detects orphan code (unreferenced functions, classes, methods) before output is delivered.
- 🔌 **WeaveLink MCP Server** — Full Model Context Protocol support for integration with Claude, Cursor, Cline and any MCP-compatible client.
- 📁 **Session Persistence** — Auto-generated `roadmap.md`, `decisions.md`, and `errors.md` per project session.

---

## 🏗️ Architecture

```
openweave/
├── apps/
│   ├── agent-core/          # 🤖 Main OpenWeave Agent (system prompt + orchestration)
│   ├── weave-cli/           # ⌨️  CLI tool — interact with OpenWeave from terminal
│   └── weave-dashboard/     # 🖥️  Web UI — visualize graph, milestones & sessions
│
├── packages/
│   ├── weave-graph/         # 🧠 WeaveGraph — knowledge graph engine & memory manager
│   ├── weave-lint/          # 🔬 WeaveLint — orphan code detector (AST analysis)
│   ├── weave-path/          # 🗺️  WeavePath — milestone & sub-task planner
│   ├── weave-link/          # 🔌 WeaveLink — MCP server for client integrations
│   └── weave-check/         # ✅ WeaveCheck — eval suite & QA framework
│
├── docs/                    # 📚 Documentation site source
├── scripts/                 # 🛠️  Dev scripts (setup, release, etc.)
└── .github/                 # ⚙️  CI/CD, issue templates, PR templates
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

| Package | Description | Status |
|---|---|---|
| [`weave-graph`](packages/weave-graph) | Core knowledge graph engine, memory compression, node/edge management | 🚧 Alpha |
| [`weave-lint`](packages/weave-lint) | AST-based orphan code detector for Python and TypeScript | 🚧 Alpha |
| [`weave-path`](packages/weave-path) | Hierarchical milestone planner with persistence and status tracking | 🚧 Alpha |
| [`weave-link`](packages/weave-link) | MCP server exposing WeaveGraph tools to Claude, Cursor, Cline | 🚧 Alpha |
| [`weave-check`](packages/weave-check) | Evaluation framework — KPIs, LLM-as-judge, red-teaming suite | 🔜 Planned |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- `pnpm` (recommended) or `npm`

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
