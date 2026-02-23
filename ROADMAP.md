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
│   ├── weave-dashboard/     # 🖥️  Web UI — visualize graph, milestones & sessions
│   └── weave-vscode/        # 🧩 VS Code Extension — WeaveGraph sidebar & commands (M25)
│
├── packages/
│   ├── weave-graph/         # 🧠 WeaveGraph — knowledge graph engine & memory manager
│   ├── weave-lint/          # 🔬 WeaveLint — orphan code detector (AST analysis)
│   ├── weave-path/          # 🗺️  WeavePath — milestone & sub-task planner
│   ├── weave-link/          # 🔌 WeaveLink — MCP server for client integrations
│   ├── weave-tools/         # 🔧 WeaveTools — external tool registry & adapters (M24)
│   ├── weave-cline/         # 🤖 WeaveCline — Cline AI assistant plugin (M26)
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
- � VS Code extension with WeaveGraph sidebar → **M25**
- 🔜 Cline plugin → **M26**

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

## PHASE 7 — Provider System `v0.7.0` ✅

> Goal: Desacoplar la persistencia del core. El storage debe ser una decisión de
> configuración, no de arquitectura. WeaveGraph, SessionLifecycle, VectorStore
> y WeavePath pasan a ser agnósticos del medio de almacenamiento.
> Status: M13–M15 completed

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

### M14 · Providers Embebidos ✅
- ✅ `weave-provider-sqlite` — `node:sqlite` built-in (Node ≥ v22.5, stable in v23+, zero native compilation)
  - Ideal para CLI, escritorio y entornos sin servidor
  - Schema único: tabla `kv_store(namespace TEXT, id TEXT, value JSON, updated_at TEXT)`
  - Pre-compiled statements; `DatabaseSync` reutilizado por toda la sesión
- ✅ Suite de contrato compartida: 16 tests de paridad con `MemoryProvider`/`JsonProvider` + extras = 23 tests
- ✅ Benchmark: 10 000 escrituras en ~173 ms, 10 000 lecturas en ~114 ms (`:memory:`, Node v25)

### M15 · Providers Remotos ✅
- ✅ `weave-provider-mongodb` — driver `mongodb` v6; schema flexible: colección `kv_store` con `{ _id, ns, value, updatedAt }`
  - `MongoProvider.connect(opts)` · `MongoProvider.fromCollection(fake)` (injectable para tests)
  - Tests con `FakeMongoCollection` in-memory — cero dependencias de mongod
- ✅ `weave-provider-postgres` — driver `pg`; compatible con `@electric-sql/pglite` (PostgreSQL WASM in-process)
  - `PostgresProvider.connect({ pool })` — acepta `pg.Pool`, `pg.Client` o `PGlite`
  - Tests con PGlite compartido (`beforeAll` file-level) — 21 tests en ~8 s
- ✅ `weave-provider-mysql` — driver `mysql2/promise`; MySQL 5.7+ y MariaDB
  - `MysqlProvider.connect({ pool })` — injectable para tests sin MySQL real
  - Tests con `FakeMysqlPool` in-memory — cero dependencias de mysqld
- ✅ Suite de contrato compartida: `runProviderContractTests(factory)` exportada desde `@openweave/weave-check`
  - 16 tests estándar; callable desde cualquier paquete de provider
  - Duck-typed `ProviderLike<T>` — sin dependencia circular en weave-provider
- ✅ `weave migrate` CLI: migración entre cualquier par de providers registrados
  - `--from json|sqlite|memory|mongodb|postgres|mysql --to ...`
  - `--dry-run` para preview sin escritura; `--prefix` para migración parcial
  - 6 nuevos tests en `weave-cli`; 35 total
- ✅ Workspace: 576 tests totales en 14 paquetes — cero regresiones

---

## PHASE 8 — SynapticEngine `v0.8.0` 🔄

> Goal: Dar a WeaveGraph comportamiento neuronal real. Cada nodo nuevo activa
> una búsqueda retroactiva sobre toda la historia del grafo, creando conexiones
> sin importar cuándo fue creado el nodo histórico — igual que las sinapsis
> cerebrales que forman nuevas rutas a través del tiempo.
> Status: M16–M18 completed

### M16 · Retroactive Linking — Keyword Phase ✅
- ✅ `SynapticEngine` class en `packages/weave-graph/src/synaptic-engine.ts`
  - `linkRetroactively(newNode, graph)` — al insertar un nodo, escanea todos los nodos históricos
  - Similitud por **keyword overlap** (Jaccard sobre tokens normalizados) — zero deps adicionales
  - Solo crea edge si `similarity >= WEAVE_SYNAPSE_THRESHOLD` (default `0.72`)
  - Respeta `WEAVE_SYNAPSE_MAX_CONNECTIONS` (default `20`) para evitar explosión de edges
  - Retorna lista de edges creados retroactivamente; edges ordenados por similitud descendente
- ✅ `tokenize()` — split camelCase/PascalCase + stop-word filtering + normalización
- ✅ `jaccardSimilarity()` — J(A,B) = |A∩B| / |A∪B|; retorna 0 para sets vacíos
- ✅ `SynapticGraph` interface — evita dependencia circular con `ContextGraphManager`
- ✅ Hook opcional en `ContextGraphManager.setSynapticEngine()` + `addNode()` — zero breaking changes
- ✅ EdgeType implícito: `RELATES` con `metadata.synapse: true` + `metadata.similarity: number`
- ✅ Configurable via constructor: `{ threshold: 0.72, maxConnections: 20 }`
- ✅ Unit tests (31 tests): `tokenize` (8) · `jaccardSimilarity` (5) · config (2) · `linkRetroactively` (12) · integration con `ContextGraphManager` (4)
- ✅ Workspace: 607 tests totales — cero regresiones

### M17 · Hebbian Strengthening + Temporal Decay ✅
- ✅ `HebbianWeights` class en `packages/weave-graph/src/hebbian-weights.ts`
  - `strengthen(edgeId, graph)` — `edge.weight += hebbianStrength` (default `0.1`), techo en `maxWeight` (default `5.0`)
  - `strengthenCoActivated(nodeIds, graph)` — batch: refuerza todos los edges entre nodos co-activados
  - `decay(graph)` — `edge.weight × decayRate` (default `0.99`) por ciclo; retorna count de edges procesados
  - `prune(graph, minWeight?)` — elimina edges cuyo weight < `pruneThreshold` (default `0.05`); retorna count eliminados
- ✅ `HebbianGraph` interface — evita dependencia circular con `ContextGraphManager`
- ✅ `ContextGraphManager.setHebbianWeights()` hook — zero breaking changes
- ✅ `queryNodesByLabel()` y `queryNodesByType()` invocan `strengthenCoActivated()` automáticamente sobre los nodos resultado
- ✅ `edge.weight` ya existía en el tipo `Edge` — zero schema changes
- ✅ Unit tests (25 tests): config (2) · `strengthen` (5) · `strengthenCoActivated` (4) · `decay` (5) · `prune` (5) · integration con `ContextGraphManager` (4)
- ✅ Workspace: 632 tests totales — cero regresiones

### M18 · Embedding-Based Retroactive Linking ✅
- ✅ `SynapticEmbeddingService` interface (duck-typed) en `synaptic-engine.ts`
  - `embed(text): Promise<{ embedding: number[] }>` — compatible con `EmbeddingService` de `@openweave/weave-embed`
  - Zero dependencia en `weave-graph/package.json` — zero deps obligatorias
- ✅ `cosineSimilarity(a, b): number` — cos θ = A·B / (|A|×|B|); exportado desde barrel
- ✅ `SynapticOptions.embeddingService?: SynapticEmbeddingService` — inyección opcional
- ✅ `SynapticEngine.hasEmbeddingService: boolean` — getter de estado
- ✅ `SynapticEngine.linkRetroactivelyEmbedding(node, graph): Promise<Edge[]>`
  - Modo embedding: cosine similarity sobre vectores — precisión semántica cross-vocabulario
  - Fallback automático a Jaccard si no hay `embeddingService` configurado — zero breaking changes
  - Edges con `metadata.mode: "embedding"` (o `"keyword"` en fallback)
- ✅ `linkRetroactively()` (keyword path) enriquecido con `metadata.mode: "keyword"`
- ✅ `_nodeText()` ahora hace `.trim()` — texto limpio independiente de descripción vacía
- ✅ `ContextGraphManager.addNodeAsync(node): Promise<Node>`
  - Hook async que invoca `linkRetroactivelyEmbedding()` cuando el engine tiene embedding service
  - Fall-through a keyword si no hay embedding service
- ✅ Barrel: exporta `cosineSimilarity` + `SynapticEmbeddingService`
- ✅ Unit tests (21 tests): `cosineSimilarity` (7) · `linkRetroactivelyEmbedding` (7) · `hasEmbeddingService`/config (3) · `addNodeAsync` (4)
- ✅ Workspace: 653 tests totales — cero regresiones

---

## PHASE 9 · Developer Agent — Skill Modules System

> Diseño clave (decisión de equipo): **cada skill es un módulo opcional**.  
> El usuario activa únicamente las capacidades que necesita vía config o CLI.  
> Ningún módulo es requerido — el agente base sigue funcionando sin ellos.

---

### M19 · Skill Module Registry �

Infraestructura que permite registrar, activar y componer módulos de habilidades de forma declarativa.

- [x] `SkillModule` interface — contrato base: `id`, `name`, `description`, `version`, `enabled`, `tags?`, `execute(context)`
- [x] `SkillRegistry` class — registro central de módulos disponibles
  - `register(module)` / `replace(module)` / `unregister(id)` — lifecycle completo
  - `enable(id)` / `disable(id)` — activa/desactiva en runtime
  - `list()` / `listEnabled()` / `get(id)` / `has(id)` / `size` — query API
  - `execute(id, ctx)` / `executeSafe(id, ctx)` / `executeAll(ctx)` — dispatch tipado
  - `loadFromConfig(cfg)` / `toConfig()` — integración con SkillConfig
- [x] `SkillContext` — `{ projectRoot, files, graph, session, git }` — inyectado en cada skill
- [x] `SkillGitContext` — `{ branch, stagedFiles, unstagedFiles, stagedDiff }`
- [x] `SkillResult` — `{ success, output, data?, error? }`
- [x] `SkillConfig` / `WeaveConfig` — interfaces de configuración
- [x] Config en `.weave.config.json` (raíz del proyecto) — sección `skills: { "auto-fix": true, ... }`
- [x] `ConfigLoader` — `loadSkillConfig` · `saveSkillConfig` · `setSkillEnabled` · `mergeSkillConfig` · `configExists`
- [x] CLI: `weave skills list` · `weave skills enable <id>` · `weave skills disable <id>` · `weave skills info <id>`
- [x] Zero breaking changes — si no hay config, el agente corre sin ningún skill activo
- [x] `packages/weave-skills/` — scaffold: `package.json`, `tsconfig.json`, `README.md`, barrel
- [x] Unit tests: registry CRUD · enable/disable · execute · executeAll · loadFromConfig · config loader I/O

---

### M20 · Core Dev Skills ✅

Módulos de asistencia al desarrollo del día a día. Cada uno es un `SkillModule` independiente.

- [x] **`auto-fix`** — lee `.sentinel_logs/VULN-*.md` y aplica los parches de remediación directamente en los archivos afectados; crea un commit por VULN
- [x] **`code-review`** — analiza el diff actual (`git diff HEAD`) y emite comentarios estructurados: bugs, style, performance, security
- [x] **`test-gen`** — detecta funciones/clases sin cobertura y genera tests unitarios Vitest compatibles; respeta patrones existentes del proyecto
- [x] **`docs-gen`** — genera o actualiza JSDoc, README por paquete y CHANGELOG desde commits convencionales
- [x] **`refactor`** — detecta code smells (funciones largas, duplicación, acoplamiento) y propone refactors con justificación y diff preview
- [x] Unit tests: ≥ 5 tests por skill · 39 tests M20 · 72 total en weave-skills

---

### M21 · DevOps Skills ✅

Módulos orientados al ciclo de integración y despliegue.

- [x] **`pipeline-aware`** — parsea logs de CI/CD (GitHub Actions, GitLab CI) y diagnostica fallos con causa raíz + acción sugerida
- [x] **`dep-audit`** — escanea `package.json` de todo el workspace, detecta dependencias con versiones obsoletas o CVEs conocidos (vía `npm audit` + advisory DB), propone upgrades
- [x] **`perf-profile`** — analiza tiempos de build, test y bundle; identifica bottlenecks e informa en formato de tabla jerarquizada
- [x] **`container-advisor`** — audita `Dockerfile`s con checklist de buenas prácticas (multi-stage, non-root, COPY scope, HEALTHCHECK, pin de versiones base)
- [x] **`deploy-provision`** — guía interactiva de aprovisionamiento de producción: invoca `scripts/deploy/setup.sh`, valida pre-requisitos (dominio DNS, puertos, Docker), reporta estado de cada paso y sugiere correcciones ante fallos; integra con M23
- [x] Unit tests: ≥ 5 tests por skill · 50 tests M21 · 122 total en weave-skills

---

### M22 · Developer Experience Skills ✅

Módulos que mejoran el flujo de trabajo individual y en equipo.

- [x] **`onboarding`** — genera un "tour interactivo" del proyecto: árbol anotado, flujo de datos principal, comandos de inicio, FAQ básica para devs nuevos
- [x] **`commit-composer`** — analiza el `git diff --staged` y propone un mensaje de commit en formato Conventional Commits; permite editar antes de confirmar
- [x] **`context-memory`** — persiste decisiones de arquitectura, acuerdos de equipo y razonamiento del agente entre sesiones usando `WeaveGraph` como memoria a largo plazo
- [x] **`multi-repo`** — permite referenciar y razonar sobre múltiples repositorios simultáneamente; útil para monorepos con dependencias cruzadas o microservicios
- [x] **`cli-interactive`** — modo REPL en terminal: `weave chat` abre una sesión conversacional persistente con historial, autocompletado de comandos y acceso a todos los skills activos
- [x] Unit tests: 55 tests M22 · 177 total en weave-skills

---

### M24 · External Tool Registry & Adapters ✅

Sistema de extensibilidad que permite a usuarios y desarrolladores registrar
cualquier herramienta externa (calendario, email, WhatsApp, Slack, APIs REST, etc.)
y exponerla al agente como si fuera una herramienta nativa de OpenWeave.

**Nuevo paquete:** `packages/weave-tools/`

```
packages/weave-tools/
└── src/
    ├── types.ts              ← ToolManifest, ExternalTool, AdapterType interfaces
    ├── tool-bridge.ts        ← ExternalToolBridge — enruta llamadas a adaptadores
    ├── tool-loader.ts        ← descubre manifests en .weave/tools/ y paquetes npm
    ├── tool-store.ts         ← persiste herramientas registradas en .weave/tools.json
    ├── adapters/
    │   ├── http-adapter.ts   ← herramientas expuestas como endpoint REST/webhook
    │   ├── mcp-adapter.ts    ← bridge a cualquier servidor MCP externo
    │   └── script-adapter.ts ← ejecuta script local (bash/python) y lee JSON stdout
    └── index.ts
```

**`ToolManifest` — formato de descriptor (`.weave/tools/<name>.tool.json`):**
```json
{
  "id": "google-calendar",
  "name": "Google Calendar",
  "description": "Create and query calendar events",
  "version": "1.0.0",
  "adapter": "http",
  "endpoint": "https://my-calendar-bridge.example.com/mcp",
  "auth": { "type": "bearer", "envVar": "GCAL_TOKEN" },
  "tools": [
    {
      "name": "create_event",
      "description": "Create a calendar event",
      "inputSchema": { "type": "object", "properties": { "title": { "type": "string" }, "date": { "type": "string" } }, "required": ["title", "date"] }
    },
    {
      "name": "list_events",
      "description": "List upcoming events",
      "inputSchema": { "type": "object", "properties": { "days": { "type": "number" } }, "required": [] }
    }
  ]
}
```

**Flujos de registro — 4 mecanismos:**

| Mecanismo | Comando / Método | Ejemplo |
|---|---|---|
| CLI interactivo | `weave tools add <url>` | `weave tools add https://my-bridge.com/manifest.json` |
| Paquete npm | `weave tools add <pkg>` | `weave tools add @openweave-tools/gmail` |
| Archivo local | Soltar `.tool.json` en `.weave/tools/` | `.weave/tools/whatsapp.tool.json` |
| Programático | `toolRegistry.register(def, handler)` | Ya funciona hoy (ToolRegistry.register()) |

**CLI commands:**
```bash
weave tools list                          # lista todas las herramientas registradas
weave tools add <url|npm-pkg|./path>      # registra una herramienta
weave tools remove <id>                   # elimina una herramienta
weave tools test <id> <tool-name> --args  # invoca una herramienta para probarla
weave tools info <id>                     # muestra el manifest y estado
```

**`ExternalToolBridge` — cómo se integra con `ToolRegistry`:**
- Al iniciar `AgentCore`, `ToolLoader` escanea `.weave/tools/*.tool.json`
- Por cada manifest, crea un `handler` que despacha la llamada al adaptador correcto
- Registra cada herramienta en `ToolRegistry` vía `registry.register(def, handler)`
- El LLM ve todas las herramientas (nativas + externas) de forma transparente
- Errores de adaptador se capturan y retornan como `ToolResult.isError = true`

**Adaptadores previstos:**

| Adaptador | Descripción | Herramientas ejemplo |
|---|---|---|
| `http` | Llama a un endpoint REST/webhook y retorna JSON | Cualquier API REST |
| `mcp` | Hace de bridge a otro servidor MCP (stdio o HTTP) | Servidores MCP comunitarios |
| `script` | Ejecuta un proceso local y lee JSON de stdout | Scripts Python, bash, Node |

**Paquetes de la comunidad (`@openweave-tools/*`):**

Convención de naming para que la comunidad publique adaptadores:
- `@openweave-tools/google-calendar` — Google Calendar API
- `@openweave-tools/gmail` — Gmail: send, read, search
- `@openweave-tools/whatsapp` — WhatsApp Business API
- `@openweave-tools/slack` — Slack: post message, list channels
- `@openweave-tools/notion` — Notion: páginas y databases
- `@openweave-tools/github` — GitHub: issues, PRs, releases

Cada paquete exporta un array de `ToolManifest[]` y opcionalmente un handler
TypeScript. Si solo se provee el manifest, el bridge usa el adaptador HTTP/MCP.

**Seguridad:**
- Las credenciales se leen de variables de entorno (nunca se almacenan en el manifest)
- Los nombres de herramientas externas se prefijan: `<tool-id>__<action>` para evitar colisiones con herramientas nativas
- `validateManifest()` verifica el schema del manifest antes de registrar
- Timeouts configurables por herramienta (`timeout_ms`, default 10 000 ms)

**Tareas de implementación:**
- [x] `packages/weave-tools/` — scaffold: `package.json`, `tsconfig.json`, barrel
- [x] `types.ts` — `ToolManifest`, `AdapterType`, `ExternalToolBridge` interfaces
- [x] `http-adapter.ts` — fetch con auth (bearer / api-key / basic), timeout, error wrapping
- [x] `mcp-adapter.ts` — bridge stdio y HTTP a otro servidor MCP
- [x] `script-adapter.ts` — `child_process.spawn`, parse JSON stdout, stderr → error
- [x] `tool-loader.ts` — scan `.weave/tools/*.tool.json` + packages `@openweave-tools/*`
- [x] `tool-store.ts` — CRUD sobre `.weave/tools.json` (add / remove / list)
- [x] `tool-bridge.ts` — `ExternalToolBridge.loadAll(registry)` llamado desde `AgentCore.init()`
- [x] `validateManifest()` — JSON Schema validation del manifest
- [x] CLI commands en `weave-cli`: `weave tools add|remove|list|test|info`
- [ ] Integración en `AgentCore` — hook `onInit` que invoca `ToolBridge.loadAll()` (post-M24)
- [ ] Docs: `docs/external-tools.md` — guía para publicar un `@openweave-tools/*` (post-M24)
- [x] Unit tests: ≥ 5 tests por adaptador · loader · store · CLI commands (61 tests)

---

---

## PHASE 10 — Production Infrastructure `v1.0.0`

> Goal: Provisionar un entorno de producción seguro con un único comando.
> nginx como reverse proxy, TLS automático vía Certbot/Let's Encrypt,
> firewall endurecido y docker-compose listo para producción.
> Status: M23 planned

### M23 · Deploy Scripts & Production Hardening 🔜

Conjunto de scripts de shell idempotentes en `scripts/deploy/` que configuran
de principio a fin un servidor Linux limpio (Ubuntu 22.04 / Debian 12) para
ejecejutar WeaveLink en producción.

```
scripts/
└── deploy/
    ├── setup.sh            ← entrypoint principal; orquesta todos los pasos
    ├── validate-env.sh     ← verifica DOMAIN, WEAVE_API_KEY y demás vars requeridas
    ├── docker.sh           ← instala Docker Engine + Compose plugin si no existen
    ├── compose.yml         ← docker-compose de producción (weave-link + volúmenes)
    ├── firewall.sh         ← ufw: deniega todo, permite 22/tcp 80/tcp 443/tcp
    ├── nginx.sh            ← instala nginx, genera weave.conf con reverse proxy
    ├── nginx.conf.tpl      ← plantilla: upstream → localhost:3001, headers seg.
    ├── certbot.sh          ← obtiene certificado Let's Encrypt; configura renovación
    └── verify.sh           ← smoke-test: GET https://<DOMAIN>/health debe retornar 200
```

**`setup.sh` — flujo de ejecución:**
```
curl -sSL https://raw.githubusercontent.com/openweave/openweave/main/scripts/deploy/setup.sh \
  | DOMAIN=api.example.com WEAVE_API_KEY=<key> bash
```
1. `validate-env.sh` — aborta si faltan variables críticas
2. `docker.sh` — instala Docker si no está presente
3. `firewall.sh` — aplica reglas ufw (idempotente)
4. `compose.yml` — levanta `ghcr.io/openweave/weave-link` con restart-policy
5. `nginx.sh` — configura reverse proxy HTTP → contenedor
6. `certbot.sh` — emite TLS, reconfigura nginx con HTTPS, activa renovación automática
7. `verify.sh` — valida que `https://<DOMAIN>/health` responde `{"status":"ok"}`

**Checklist de seguridad que cubre M23:**

| Control | Mecanismo |
|---|---|
| TLS obligatorio | Certbot + Let's Encrypt; HTTP → HTTPS redirect |
| Cabeceras de seguridad | `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` |
| Rate limiting | `limit_req_zone` en nginx (100 req/s por IP) |
| Firewall | ufw deny all → allow 22/80/443 solamente |
| Autenticación | `WEAVE_API_KEY` obligatoria (VULN-009 ya corregido) |
| Secretos en runtime | Key inyectada vía env var, nunca en imagen Docker |
| Renovación TLS | `systemd timer` o `cron` semanal (`certbot renew --quiet`) |
| Usuario no-root | `USER weave` en el contenedor (ya en Dockerfile) |
| CORS restringido | Deshabilitado por defecto (VULN-003/008 ya corregidos) |

**Variables de entorno requeridas por `setup.sh`:**

```bash
DOMAIN=api.example.com       # FQDN con DNS apuntando al servidor
WEAVE_API_KEY=<key>          # generada con: weave-link keygen
EMAIL=admin@example.com      # para notificaciones de expiración de cert
WEAVE_PORT=3001              # puerto interno del contenedor (default: 3001)
WEAVE_PROVIDER=sqlite        # provider de persistencia (sqlite | postgres | ...)
```

**Tareas de implementación:**
- [ ] `validate-env.sh` — chequeo de vars + DNS lookup del dominio
- [ ] `docker.sh` — detección de distro (apt/yum), instalación Docker CE
- [ ] `firewall.sh` — reglas ufw idempotentes
- [ ] `compose.yml` — servicio `weave-link`, volumen `weave-data`, red interna
- [ ] `nginx.sh` + `nginx.conf.tpl` — upstream, proxy_pass, security headers, rate limit
- [ ] `certbot.sh` — `certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL`
- [ ] `verify.sh` — curl con exit-code; imprime resumen de lo instalado
- [ ] `setup.sh` — orquestador con colores, progress steps y rollback en caso de fallo
- [ ] Integración con skill `deploy-provision` (M21) — el agente puede ejecutar y monitorizar cada paso
- [ ] README en `scripts/deploy/README.md` — requisitos, ejemplo de uso, troubleshooting

---

## PHASE 11 — IDE Integrations `v1.1.0`

> Goal: Integrar OpenWeave nativamente en el flujo de trabajo del desarrollador dentro de VS Code
> y en el ciclo de asistentes de IA de código como Cline — sin salir del editor.
> Status: M25/M26 planned

---

### M25 · VS Code Extension — WeaveGraph Sidebar 🔜

Extensión oficial de OpenWeave para VS Code. Expone el grafo de conocimiento,
las sesiones activas y los milestones directamente en el sidebar del editor.
Se conecta al servidor WeaveLink HTTP local (levantado con `weave-link start`).

**Nuevo app:** `apps/weave-vscode/`

```
apps/weave-vscode/
├── package.json              ← vscode engine ≥ 1.85, contributes: views, commands, config
├── tsconfig.json
└── src/
    ├── extension.ts          ← activate() / deactivate() — entry point del ciclo de vida
    ├── sidebar/
    │   ├── GraphWebviewPanel.ts      ← WebviewPanel con el GraphRenderer de weave-dashboard
    │   ├── MilestoneTreeProvider.ts  ← TreeDataProvider: árbol de fases → milestones → tareas
    │   └── SessionTreeProvider.ts   ← TreeDataProvider: sesiones activas por chat_id
    ├── commands/
    │   ├── init.ts           ← `openweave.init` — inicializa .weave/ en el workspace
    │   ├── query.ts          ← `openweave.query` — quick-pick de búsqueda en el grafo
    │   ├── save-node.ts      ← `openweave.saveNode` — formulario para añadir nodo manualmente
    │   └── connect.ts        ← `openweave.connect` — configura URL y API Key del servidor
    ├── status-bar/
    │   └── WeaveStatusBar.ts ← ítem en status bar: sesión activa + nodos + estado de conexión
    └── client/
        └── WeaveExtensionClient.ts ← wrapper de WeaveDashboardClient con reconexión automática
```

**`package.json` — contribuciones VS Code:**

```jsonc
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "openweave", "title": "OpenWeave", "icon": "media/weave.svg" }]
    },
    "views": {
      "openweave": [
        { "id": "openweave.graph",      "name": "Knowledge Graph",  "type": "webview" },
        { "id": "openweave.milestones", "name": "Milestones",       "type": "tree"    },
        { "id": "openweave.sessions",  "name": "Sessions",         "type": "tree"    }
      ]
    },
    "commands": [
      { "command": "openweave.init",      "title": "OpenWeave: Init Project"    },
      { "command": "openweave.query",     "title": "OpenWeave: Query Graph"     },
      { "command": "openweave.saveNode",  "title": "OpenWeave: Save Node"       },
      { "command": "openweave.connect",   "title": "OpenWeave: Connect Server"  },
      { "command": "openweave.refresh",   "title": "OpenWeave: Refresh"         }
    ],
    "configuration": {
      "properties": {
        "openweave.serverUrl":  { "type": "string",  "default": "http://localhost:3000" },
        "openweave.apiKey":     { "type": "string",  "default": ""                     },
        "openweave.autoStart":  { "type": "boolean", "default": true                   },
        "openweave.refreshMs":  { "type": "number",  "default": 5000                   }
      }
    }
  }
}
```

**Flujo de datos:**
```
VS Code Sidebar
    │
    ▼
WeaveExtensionClient  ──HTTP──►  WeaveLink (localhost:3000)
    │                                  │
    ├── GraphWebviewPanel  ◄── GET /graph-snapshot
    ├── MilestoneTreeProvider ◄── POST /tools/call (get_next_action)
    └── SessionTreeProvider   ◄── GET /sessions
```

**Dependencias clave:**
- `WeaveDashboardClient` de `@openweave/weave-dashboard` (M10) ✅
- `GraphRenderer` (D3) embebido en el Webview via CDN o bundled
- `vscode` peerDependency — zero deps en producción fuera de VS Code
- SSE stream (`GET /events`) para live-refresh sin polling

**Distribución:**
- Publicar como `.vsix` en [VS Code Marketplace](https://marketplace.visualstudio.com/)
- GitHub Release adjunta el `.vsix` en cada tag semver
- `vsce package` en CI (`apps/weave-vscode/.github/workflows/publish.yml`)

**Tareas de implementación:**
- [ ] Scaffold `apps/weave-vscode/` — `package.json` con `vscode` engine ≥ 1.85
- [ ] `extension.ts` — `activate()`: registra comandos, providers, status bar
- [ ] `WeaveExtensionClient` — wrapper `WeaveDashboardClient` con retry y SSE keepalive
- [ ] `WeaveStatusBar` — estado de conexión + sesión activa en barra inferior
- [ ] `SessionTreeProvider` — `TreeDataProvider<SessionItem>` con refresh on SSE event
- [ ] `MilestoneTreeProvider` — `TreeDataProvider<MilestoneItem>` con íconos por status
- [ ] `GraphWebviewPanel` — Webview con HTML+D3 del `GraphRenderer` de weave-dashboard
- [ ] Comandos: `init`, `query` (QuickPick), `saveNode` (InputBox flow), `connect`
- [ ] Configura `openweave.autoStart` para levantar `weave-link start` al abrir workspace
- [ ] Tests con `@vscode/test-electron` — mocks de vscode API
- [ ] CI: `vsce package` + upload `.vsix` como artifact
- [ ] Docs: `apps/weave-vscode/README.md` — instalación, configuración, capturas de pantalla
- [ ] Unit tests: ≥ 8 tests (client, tree providers, status bar, command handlers)

---

### M26 · Cline Plugin 🔜

Plugin oficial de OpenWeave para [Cline](https://github.com/cline/cline) — el asistente de IA
para VS Code. Expone las 7 herramientas nativas de OpenWeave al loop de Cline, permitiéndole
guardar nodos, consultar el grafo y actualizar milestones de forma autónoma durante una sesión
de codificación sin salir de VS Code.

**Nuevo paquete:** `packages/weave-cline/`

```
packages/weave-cline/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              ← barrel: exporta ClinePlugin y defaultTools
    ├── plugin.ts             ← ClinePlugin class — implementa la interfaz de Cline
    ├── tools.ts              ← mapea ToolDefinition[] de OpenWeave al formato de Cline
    ├── client.ts             ← cliente HTTP ligero hacia WeaveLink (sin deps extra)
    └── weave-cline.test.ts
```

**Arquitectura de integración:**

```
Cline (VS Code Extension)
    │
    ├── ClinePlugin.getTools()      ← retorna las 7 herramientas OpenWeave en formato Cline
    │
    └── ClinePlugin.executeTool()   ── HTTP POST ──►  WeaveLink :3000/tools/call
                                                            │
                                                      WeaveGraph / WeavePath
```

**`ClinePlugin` interface:**
```typescript
export interface ClinePluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  tools: ClineTool[];
}

export class ClinePlugin {
  constructor(options: { serverUrl?: string; apiKey?: string }) {}

  /** Devuelve el manifest completo con las 7 tools en formato Cline */
  getManifest(): ClinePluginManifest;

  /** Ejecuta una tool call y retorna el resultado como string */
  executeTool(name: string, args: Record<string, unknown>): Promise<string>;

  /** Health-check: verifica que WeaveLink está disponible */
  isAvailable(): Promise<boolean>;
}
```

**Herramientas expuestas a Cline (mapeadas desde `BUILTIN_TOOLS`):**

| OpenWeave tool | Descripción para Cline |
|---|---|
| `save_node` | Save a concept, decision or error to the knowledge graph |
| `query_graph` | Search the knowledge graph by keyword |
| `suppress_error` | Mark an error as resolved with a correction note |
| `update_roadmap` | Update milestone or sub-task status |
| `get_session_context` | Retrieve current session state and graph snapshot |
| `get_next_action` | Get the recommended next sub-task to work on |
| `list_orphans` | Detect unused exports in the current project |

**Configuración en Cline (`cline_mcp_settings.json` alternativo via plugin):**
```jsonc
// .vscode/settings.json
{
  "cline.plugins": [
    {
      "id": "openweave",
      "package": "@openweave/weave-cline",
      "config": {
        "serverUrl": "http://localhost:3000",
        "apiKey": "${env:WEAVE_API_KEY}"
      }
    }
  ]
}
```

**Alternativa MCP (recomendada si Cline soporta MCP):**

Cline ya soporta el protocolo MCP nativo. En ese caso, `weave-cline` actúa como
un thin wrapper que genera la entrada `mcpServers` para `cline_mcp_settings.json`
apuntando al `WeaveLink` stdio/HTTP existente (sin código extra):

```jsonc
// ~/.vscode-server/data/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
{
  "mcpServers": {
    "openweave": {
      "command": "node",
      "args": ["/path/to/weave-link/dist/index.js"],
      "env": { "WEAVE_API_KEY": "<key>" }
    }
  }
}
```

`weave-cline` instalará esta configuración automáticamente con:
```bash
weave-link install cline          # nuevo subcommand en M8 actualizado
weave-link uninstall cline
```

**Relación con M8:**
- M8 ya tiene `ClaudeDesktopInstaller` y `CursorInstaller` — `ClineInstaller` sigue el mismo patrón
- Se añade `ClineInstaller` a `packages/weave-link/src/installers/cline-installer.ts`
- Se registra en `weave-link install <claude|cursor|cline>`

**Tareas de implementación:**
- [ ] Investigar API de plugins de Cline (verificar si es MCP-native o custom plugin system)
- [ ] `ClineInstaller` en `packages/weave-link/src/installers/cline-installer.ts` — mismo patrón que `CursorInstaller`
- [ ] `weave-link install cline` / `weave-link uninstall cline` CLI subcommands
- [ ] Si Cline tiene plugin API custom: scaffold `packages/weave-cline/` con `ClinePlugin`
- [ ] `tools.ts` — adapta `BUILTIN_TOOLS` (ToolDefinition[]) al formato de tool definition de Cline
- [ ] `client.ts` — HTTP client ligero: `POST /tools/call` con auth y timeout
- [ ] `plugin.ts` — `ClinePlugin.executeTool()` con error handling + JSON parse
- [ ] Docs: `packages/weave-cline/README.md` — instalación en 3 pasos, ejemplo de sesión
- [ ] Unit tests: ≥ 8 tests (manifest, executeTool mock, isAvailable, error cases)
- [ ] Integración E2E: Cline invoca `save_node` → WeaveLink → verificar nodo en grafo

---

## How to Influence the Roadmap

- 💬 Open a [Discussion](https://github.com/lemur-bookstores/openweave/discussions)
- 🐛 File an [Issue](https://github.com/lemur-bookstores/openweave/issues)
- 🗳️ Vote on existing issues with 👍
- 📣 Join [Discord](https://discord.gg/openweave) `#roadmap` channel