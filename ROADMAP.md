# 🗺️ OpenWeave Roadmap

> This roadmap follows the WeavePath methodology — Epics → Milestones → Sub-tasks.
> Status is updated with each release.

## Legend
- ✅ Completed
- 🔄 In Progress
- 🔜 Planned
- 💭 Exploring

---
# 📐 ARQUITECTURA: OpenWeave

┌─────────────────────────────────────────────────────────────┐
│                          OpenWeave                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  SHORT-TERM  │◄──►│   CONTEXT    │◄──►│  LONG-TERM   │   │
│  │   MEMORY     │    │   MANAGER    │    │   MEMORY     │   │
│  │  (Window)    │    │  (Monitor)   │    │  (Vector DB) │   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘   │
│         │                  │                    │           │
│         ▼                  ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              KNOWLEDGE GRAPH ENGINE                 │    │
│  │                                                     │    │
│  │   [concept]──relates──[concept]                     │    │
│  │       │                   │                         │    │
│  │    causes              blocks                       │    │
│  │       │                   │                         │    │
│  │   [decision]◄──corrects──[ERROR NODE]               │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐         │
│  │  MILESTONE  │  │     CODE     │  │  SESSION    │         │
│  │    PLANNER  │  │  VALIDATOR   │  │  PERSISTER  │         │
│  │  (Task Tree)│  │(Orphan Detec)│  │ (by chat_id)│         │
│  └─────────────┘  └──────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘

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

Leer docs\SKILL-package-setup.md

## PHASE 1 — Foundation `v0.1.0` 🔄

> Goal: Core packages working locally, CLI usable, MCP server connectable.
> Status: M1-M4 completed, M5 in progress

### M1 · WeaveGraph Core ✅
- ✅ Node and edge data models (6 types, 6 edge types)
- ✅ JSON persistence layer per `chat_id` (save/load/list/export/import)
- ✅ Keyword-based node retrieval & ranking by frequency
- ✅ Context compression trigger (75% threshold) with smart archival
- ✅ Error suppression + correction node linking
- ✅ Unit tests (43 tests passing)

### M2 · WeaveLint Core ✅
- ✅ TypeScript AST orphan detector (8 tests)
  - Function, class, interface, type, variable extraction
  - Export status detection with keyword matching
  - Usage reference tracking with context snippets
- ✅ Python AST orphan detector (5 tests)
  - Function, class, module-level variable analysis
  - Private/public visibility semantics
  - Import and usage pattern tracking
- ✅ OrphanDetector core engine (9 tests)
  - Two-phase analysis: entity discovery + usage mapping
  - Severity classification (CRITICAL/HIGH/MEDIUM/LOW)
  - Special entity recognition (main, __init__, exports, etc.)
  - Comprehensive orphan report generation with suggestions
- ✅ Unit tests (22 tests passing)

### M3 · WeavePath Core ✅
- ✅ Milestone + sub-task data model (types.ts)
  - Status enum: NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, DEFERRED
  - Priority levels: CRITICAL → HIGH → MEDIUM → LOW
  - Hierarchical structure: Epic → Phase → Milestone → SubTask
- ✅ WeavePath core engine (weave-path.ts)
  - Full CRUD for milestones and sub-tasks
  - Automatic milestone status propagation from sub-tasks
  - Two-phase next action resolver respecting dependencies
  - Progress metrics with hours tracking (est. vs actual)
  - Session persistence (save/load milestone state)
- ✅ Roadmap auto-generation (roadmap-generator.ts)
  - Markdown generation from milestone data
  - Progress bars and summary tables
  - Status icons for visual scanning
- ✅ Unit tests (19 tests passing)
  - Milestone management: 3 tests
  - Sub-task management: 4 tests
  - Progress metrics: 3 tests
  - Next action resolver: 3 tests
  - Roadmap generation: 3 tests
  - Session persistence: 1 test
  - RoadmapGenerator: 3 tests

### M4 · WeaveLink MCP Server ✅
- ✅ WeaveLinkServer core (mcp-server.ts)
  - Full tool call routing with error handling
  - Session management and state tracking
  - Mock implementations for all 7 tools
  - Server info and capabilities reporting
- ✅ MCP tool definitions (tools.ts) with 7 tools:
  - `save_node` — Add/update nodes in knowledge graph
  - `query_graph` — Search graph by keyword  
  - `suppress_error` — Mark errors with corrections
  - `update_roadmap` — Track milestone progress
  - `get_session_context` — Retrieve full session state
  - `get_next_action` — Recommend next sub-task
  - `list_orphans` — Detect unused code in project
- ✅ Complete type system (types.ts)
  - Argument types for all tools
  - Response wrappers and MCP protocol structures
  - Tool definition interfaces
- ✅ Unit tests (29 tests passing)
  - Server initialization and configuration
  - Tool listing and retrieval
  - All 7 tool handlers tested
  - Input validation for each tool
  - Error handling and edge cases
  - Tool metadata validation

### M5 · Weave CLI
- 🔜 `weave init <project>` — scaffold session
- 🔜 `weave status` — show current milestones
- 🔜 `weave errors` — list error pattern registry

---

## PHASE 2 — Semantic Memory `v0.2.0` 🔜

> Goal: Replace keyword search with semantic embeddings. Graph becomes truly intelligent.

### M6 · Embedding-Based Retrieval
- 💭 Integrate sentence-transformers (local, no API dependency)
- 💭 Cosine similarity search on WeaveGraph nodes
- 💭 Hybrid search: semantic + structural graph traversal

### M7 · Automatic Context Grafization
- 💭 LLM-powered entity extraction during compression
- 💭 Auto-detect relationship types between extracted concepts
- 💭 Confidence scoring for nodes based on repetition frequency

---

## PHASE 3 — Integrations `v0.3.0` 🔜

> Goal: First-class support for major AI clients and IDEs.

### M8 · Client Integrations
- 💭 Claude Desktop config guide + auto-installer
- 💭 Cursor extension
- 💭 VS Code extension with WeaveGraph sidebar
- 💭 Cline plugin

### M9 · Remote WeaveLink
- 💭 HTTP/SSE transport (remote MCP server)
- 💭 Auth via API keys
- 💭 Docker image: `ghcr.io/openweave/weave-link`

---

## PHASE 4 — Dashboard & Visualization `v0.4.0` 🔜

> Goal: Visual interface for graph, milestones, and session management.

### M10 · Weave Dashboard
- 💭 Interactive graph visualization (D3 / Cytoscape)
- 💭 Milestone progress board (Kanban view)
- 💭 Error registry browser
- 💭 Session comparison (diff two `chat_id` graphs)

---

## PHASE 5 — WeaveCheck Eval Suite `v0.5.0` 🔜

> Goal: Measurable, reproducible quality metrics for the agent.

### M11 · Evaluation Framework
- 💭 Orphan rate KPI (automated)
- 💭 Context coherence KPI (LLM-as-judge)
- 💭 Error non-repetition rate (red-team suite)
- 💭 Milestone adherence KPI
- 💭 Context compression quality KPI

---

## How to Influence the Roadmap

- 💬 Open a [Discussion](https://github.com/openweave/openweave/discussions)
- 🐛 File an [Issue](https://github.com/openweave/openweave/issues)
- 🗳️ Vote on existing issues with 👍
- 📣 Join [Discord](https://discord.gg/openweave) `#roadmap` channel