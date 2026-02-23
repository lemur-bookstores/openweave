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
│   ├── weave-check/         # ✅ WeaveCheck — eval suite & QA framework
│   ├── weave-provider/      # 🔌 Interfaz abstracta de persistencia (contrato IWeaveProvider)
│   ├── weave-provider-json/     # 📄 Implementación JSON local (default, zero-config)
│   ├── weave-provider-sqlite/   # 🗄️  Implementación SQLite (embebido, ideal para CLI)
│   ├── weave-provider-mongodb/  # 🍃 Implementación MongoDB
│   ├── weave-provider-postgres/ # 🐘 Implementación PostgreSQL
│   └── weave-provider-mysql/    # 🐬 Implementación MySQL
│
├── docs/                    # 📚 Documentation site source
├── scripts/                 # 🛠️  Dev scripts (setup, release, etc.)
└── .github/                 # ⚙️  CI/CD, issue templates, PR templates

Leer docs\SKILL-package-setup.md

## PHASE 1 — Foundation `v0.1.0` ✅

> Goal: Core packages working locally, CLI usable, MCP server connectable.
> Status: M1-M5 completed

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

### M5 · Weave CLI ✅
- ✅ CLI command interface (7 commands)
- ✅ `weave init <project>` — Initialize new project with .weave directory
- ✅ `weave status` — Show current project status and graph statistics
- ✅ `weave milestones` — List all milestones with filtering and progress bars
- ✅ `weave query <term>` — Search knowledge graph with type and limit filters
- ✅ `weave orphans` — Analyze code for unused exports with severity levels
- ✅ `weave errors` — Display error registry with filtering options
- ✅ `weave save-node` — Manually add nodes to the knowledge graph
- ✅ Argument parsing with global flags (--help, --version, --json, --verbose)
- ✅ Interactive output with status icons and progress indicators
- ✅ JSON output support for all commands for programmatic use
- ✅ Unit tests (29 tests passing)
  - InitCommand: 3 tests (create, invalid args, reinit protection)
  - StatusCommand: 3 tests (display, verbose, JSON format)
  - MilestonesCommand: 3 tests (list, filter, JSON format)
  - QueryCommand: 3 tests (search, limit, type filter)
  - OrphansCommand: 3 tests (analyze, filter by severity and type)
  - ErrorsCommand: 3 tests (registry, type and status filters)
  - SaveNodeCommand: 5 tests (create, validation, metadata, JSON)
  - CLI Integration: 3 tests (help, version, command structure)

---

## PHASE 2 — Semantic Memory `v0.2.0` ✅

> Goal: Replace keyword search with semantic embeddings. Graph becomes truly intelligent.
> Status: M6-M7 completed

### M6 · Embedding-Based Retrieval ✅
- ✅ Integrate sentence-transformers (local, no API dependency) via `@xenova/transformers`
- ✅ Cosine similarity + Euclidean distance search on WeaveGraph nodes
- ✅ Hybrid search: semantic + structural graph traversal with configurable weights
- ✅ `EmbeddingService` with caching and batch processing
- ✅ `VectorStore` with import/export persistence support
- ✅ Unit tests (30 tests passing)

### M7 · Automatic Context Grafization ✅
- ✅ Local entity extraction from raw text (no LLM API required)
  - PascalCase, camelCase, UPPER_SNAKE_CASE, backtick-quoted, and Title Case patterns
  - Keyword-context classification into NodeTypes (CONCEPT, DECISION, ERROR, CORRECTION, MILESTONE, CODE_ENTITY)
  - Frequency counting, confidence scoring (0–1), and context snippet capture
  - Stop-word filtering and configurable min-confidence / max-entities limits
- ✅ Auto-detection of relationship types between entity pairs
  - 6 EdgeType patterns: CORRECTS, CAUSES, IMPLEMENTS, DEPENDS_ON, BLOCKS, RELATES
  - Co-occurrence window analysis with proximity-weighted confidence
  - Deduplication keeping highest-confidence pair per (src, tgt)
- ✅ Confidence scoring based on frequency, pattern specificity, and context
- ✅ `AutoGrafizer` orchestrator with `grafize()`, `grafizeDelta()`, and `preview()`
- ✅ Optional semantic deduplication via `EmbeddingService` cosine similarity
- ✅ Unit tests (37 tests passing)
  - EntityExtractor: 11 tests
  - RelationshipDetector: 10 tests
  - AutoGrafizer: 12 tests
  - Integration: 4 tests

---

## PHASE 3 — Integrations `v0.3.0` ✅

> Goal: First-class support for major AI clients and IDEs.
> Status: M8/M9 completed

### M8 · Client Integrations ✅
- ✅ Claude Desktop auto-installer (`ClaudeDesktopInstaller`)
  - Cross-platform config path resolution (Windows / macOS / Linux)
  - `install()` / `uninstall()` — merges into existing config without overwriting other servers
- ✅ Cursor installer (`CursorInstaller`)
  - Global (`~/.cursor/mcp.json`) and project (`.cursor/mcp.json`) scopes
  - `install()` / `uninstall()` with scope selection
- ✅ `ConfigGenerator` — generates `mcpServers` entries for stdio and HTTP modes
- ✅ `weave-link install <claude|cursor>` CLI command
- ✅ `weave-link uninstall <claude|cursor>` CLI command
- 💭 VS Code extension with WeaveGraph sidebar
- 💭 Cline plugin

### M9 · Remote WeaveLink ✅
- ✅ `HttpTransport` — HTTP server using zero runtime dependencies (Node built-ins only)
  - `GET /` server info · `GET /health` liveness · `GET /tools` list
  - `POST /tools/call` invoke tools · `GET /events` SSE stream
  - CORS headers for dashboard / webview access
- ✅ `AuthManager` — API key auth via `Authorization: Bearer` or `X-API-Key`
  - Enable/disable at runtime, add/remove keys dynamically
- ✅ `generateApiKey()` — crypto-random key generator
- ✅ `weave-link start` CLI with `--mode http|stdio`, `--port`, `--host`, `--no-auth`
- ✅ `weave-link keygen` and `weave-link status` CLI subcommands
- ✅ Unit tests (82 tests passing across M8 + M9 + original 29)
  - AuthManager: 10 tests
  - generateApiKey: 4 tests
  - HttpTransport (no auth): 13 tests
  - HttpTransport (with auth): 4 tests
  - HttpTransport SSE: 1 test
  - ConfigGenerator: 7 tests
  - ClaudeDesktopInstaller: 7 tests
  - CursorInstaller: 7 tests
  - Integration: 1 test
- ✅ Docker image: `ghcr.io/openweave/weave-link`
  - `packages/weave-link/Dockerfile` — multi-stage build (builder → production, node:22-alpine)
  - `.dockerignore` — repo-root context, excludes unused packages/apps
  - `.github/workflows/docker.yml` — builds `linux/amd64` + `linux/arm64`, pushes to GHCR on `main` and semver tags

---

## PHASE 4 — Dashboard & Visualization `v0.4.0` ✅

> Goal: Visual interface for graph, milestones, and session management.
> Status: M10 completed

### M10 · Weave Dashboard ✅
- ✅ `WeaveDashboardClient` — fetch-based HTTP client wrapping the WeaveLink REST API
  - `getHealth()`, `getServerInfo()`, `listTools()`, `callTool()`, `getSnapshot()`, `listSessions()`, `queryGraph()`
  - `DashboardApiError` + `NetworkError` typed error classes
  - Bearer token (`Authorization`) and `X-API-Key` auth support
  - SSE event stream via `openEventStream()`
- ✅ `SessionDiff` — pure diff of two GraphSnapshots (added/removed/changed nodes + edges)
  - `diff(sessionA, snapA, sessionB, snapB)` → `GraphDiff`
  - `summarize(diff)` → human-readable change summary with similarity %
- ✅ `GraphLayoutEngine` — Fruchterman–Reingold force-directed layout (pure TS, no DOM)
  - Configurable canvas size, iterations, spring constant, cooling rate, gravity
  - `validateBounds(layout, w, h)` utility
- ✅ `MilestoneBoard` — pure data transformation: milestones → Kanban columns
  - `toColumns()`, `toCard()`, `stats()`, `sortByPriority()`
  - Excludes BLOCKED / DEFERRED from overall progress calculation
- ✅ `ErrorRegistry` — extracts ERROR nodes, cross-references CORRECTS edges
  - `build()`, `filter()` (showCorrected + searchQuery), `stats()`
- ✅ `GraphRenderer` — D3-powered SVG graph with zoom, drag, hover tooltips, coloured node types
- ✅ Dashboard SPA (`index.html` + `src/app.ts` + `src/main.ts`)
  - 4 views: Graph 🧠 · Milestones 🗺 · Errors ⚠️ · Session Diff 🔀
  - Vite dev server with proxy to WeaveLink HTTP server (`/api → localhost:3000`)
  - Dark theme UI with GitHub-style colour tokens
- ✅ Unit tests (60 tests passing)
  - WeaveDashboardClient: 12 tests
  - SessionDiff: 12 tests
  - GraphLayoutEngine: 10 tests
  - MilestoneBoard: 13 tests
  - ErrorRegistry: 13 tests

---

## PHASE 5 — WeaveCheck Eval Suite `v0.5.0` ✅

> Goal: Measurable, reproducible quality metrics for the agent.
> Status: M11 completed

### M11 · Evaluation Framework ✅
- ✅ `OrphanRateEvaluator` — scores unused code rate; severity-weighted (CRITICAL=3×, HIGH=2×)
- ✅ `GraphCoherenceEvaluator` — 4 sub-checks: dangling edges, isolated nodes, error correction coverage, density
- ✅ `ErrorRepetitionEvaluator` — cross-session error label normalisation; `excludeCorrected` option
- ✅ `MilestoneAdherenceEvaluator` — completion rate + hour accuracy; BLOCKED/DEFERRED excluded
- ✅ `CompressionQualityEvaluator` — preservation of high-freq nodes + archival rate + size reduction
- ✅ `WeaveCheckRunner` — orchestrates all 5 evaluators, produces `EvalReport` with overall score
  - `run(inputs)` — skips evaluators with no input; catches evaluator errors gracefully
  - `formatReport(report)` — human-readable CLI/log output
  - `skip` option to exclude specific KPI IDs
- ✅ Zero runtime dependencies — self-contained input type mirrors from other packages
- ✅ Unit tests (60 tests passing)
  - OrphanRateEvaluator: 10 tests
  - GraphCoherenceEvaluator: 10 tests
  - ErrorRepetitionEvaluator: 10 tests
  - MilestoneAdherenceEvaluator: 10 tests
  - CompressionQualityEvaluator: 10 tests
  - WeaveCheckRunner: 10 tests

---

## PHASE 6 — Agent Core `v0.6.0` ✅

> Goal: A standalone, testable OpenWeave agent that orchestrates all packages
> through a ReAct loop with persistent sessions and context compression.
> Status: M12 completed

### M12 · Agent Core ✅
- ✅ `types.ts` — Self-contained type definitions: `AgentMessage`, `PendingToolCall`, `ToolResult`, `TokenUsage`, `CompressionPolicy`, `SessionInfo`, `AgentConfig`, `LLMClient` interface, `AgentEvent`
- ✅ `SystemPromptBuilder` — Composes the full system prompt with live graph context injection
  - `OPENWEAVE_BASE_PROMPT` — Persona, ReAct style, knowledge-graph semantics, tool usage policy
  - `build({ session, graphContext, extraInstructions })` — Full prompt with optional sections
  - `buildMinimal(sessionId)` — Lightweight prompt for subprocess/stdio use
- ✅ `ToolRegistry` — Registers 7 canonical OpenWeave tools with JSON-Schema definitions
  - `save_node`, `query_graph`, `suppress_error`, `update_roadmap`, `get_session_context`, `get_next_action`, `list_orphans`
  - `register()` — add custom tools at runtime
  - `bindHandler()` — replace noop handler with a real WeaveLink-connected implementation
  - `execute()` — typed dispatch with error capture; returns `ToolResult`
- ✅ `ContextManager` — Token budget tracker with lightweight char-based estimation
  - `estimateTokens()` / `estimateMessageTokens()` — zero-dep approximation
  - `shouldCompress()` — triggers at configurable threshold (default 75%)
  - `compress()` — archives low-priority tail messages, accumulates archived-token ledger
  - `reset()` — clears archived state on session start
- ✅ `SessionLifecycle` — JSON-based session persistence to `.weave-sessions/`
  - `init()` — create or resume session
  - `save()` / `load()` — roundtrip `SessionInfo` as JSON
  - `recordTurn()` / `recordCompression()` — incremental counters
  - `close()` — marks session as closed
- ✅ `AgentCore` — Main ReAct orchestrator (Pattern: Thought → Action → Observation → repeat)
  - Injectable `LLMClient` interface for test mocking and provider swapping
  - `init()` — boots session, builds system prompt, emits `session:started`
  - `run(userMessage, options?)` — ReAct loop with configurable `maxTurns`
  - `close()` — graceful shutdown, persists closed status
  - `on()` / `off()` — event bus for `session:*`, `turn:*`, `tool:*`, `context:compressed`
- ✅ `main.ts` CLI — `agent-core start|status|sessions` REPL with stdin/stdout
- ✅ Unit tests (61 tests passing)
  - SystemPromptBuilder: 10 tests
  - ToolRegistry: 14 tests
  - ContextManager: 13 tests
  - SessionLifecycle: 10 tests
  - AgentCore: 14 tests

---

## PHASE 7 — Provider System `v0.7.0` 🔜

> Goal: Desacoplar la persistencia del core. El storage debe ser una decisión de
> configuración, no de arquitectura. WeaveGraph, SessionLifecycle, VectorStore
> y WeavePath pasan a ser agnósticos del medio de almacenamiento.
> Status: Planned

### M13 · weave-provider — Contrato de Persistencia ✅
- ✅ Interfaz `IWeaveProvider<T>` definida en TypeScript
  - `get(key)` · `set(key, value)` · `delete(key)` · `list(prefix?)` · `clear(prefix?)` · `close()`
- ✅ `MemoryProvider` (`Map<>`) para tests y sesiones efímeras
- ✅ `JsonProvider` — migración directa desde `weave-graph/PersistenceManager`; zero breaking changes
  - Key convention `graph:<chatId>` preserva backward-compat total
- ✅ `ProviderRegistry` — resolución via `WEAVE_PROVIDER` env var; registro de factories en runtime
- ✅ `resolveProvider<T>()` — helper para obtener el provider configurado
- ✅ Inyección opcional en `WeaveGraph/PersistenceManager` (JsonProvider como fallback)
- ✅ Inyección opcional en `agent-core/SessionLifecycle` + async API (`initAsync/saveAsync/loadAsync/listSessionIdsAsync`)
- ✅ Suite de contrato compartida: 16 tests × 2 providers + extras + registry = 45 tests

### M14 · Providers Embebidos 🔜
- 🔜 `weave-provider-sqlite` — `better-sqlite3` (zero native deps en la mayoría de plataformas)
  - Ideal para CLI, escritorio y entornos sin servidor
  - Schema único: tabla `kv_store(namespace TEXT, id TEXT, value JSON, updated_at TEXT)`
- 🔜 Tests de paridad: mismo comportamiento observable que `JsonProvider`
- 🔜 Benchmark: latencia de lectura/escritura vs JSON para grafos de 10k+ nodos

### M15 · Providers Remotos 💭
- 💭 `weave-provider-mongodb` — driver nativo; schema flexible alineado con `GraphSnapshot`
- 💭 `weave-provider-postgres` — `pg` / `drizzle-orm`; tablas relacionales para nodos y aristas
- 💭 `weave-provider-mysql` — `mysql2`; alternativa relacional para infra MySQL existente
- 💭 Suite de tests compartida en `weave-check` que corre el mismo spec contra cualquier provider
- 💭 CLI de migración: `weave migrate --from json --to sqlite|postgres|mongodb`

---

## How to Influence the Roadmap

- 💬 Open a [Discussion](https://github.com/lemur-bookstores/openweave/discussions)
- 🐛 File an [Issue](https://github.com/lemur-bookstores/openweave/issues)
- 🗳️ Vote on existing issues with 👍
- 📣 Join [Discord](https://discord.gg/openweave) `#roadmap` channel