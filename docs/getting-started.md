# 🚀 Getting Started with OpenWeave

> This guide walks you through installing, configuring, and running your first
> OpenWeave session — from cloning the repo to querying a live knowledge graph.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | ≥ 25.6.1 | Runtime — required for `node:sqlite` built-in |
| **pnpm** | ≥ 10 | Workspace package manager |
| **git** | any | Source control |
| **git-flow** | any | Recommended branching strategy |

> **Why Node.js 25?** OpenWeave uses the `node:sqlite` built-in module
> (stable since Node 22.5) for the SQLite provider. No native compilation needed.

---

## 1. Clone & Install

```bash
git clone https://github.com/lemur-bookstores/openweave.git
cd openweave

# Install all workspace dependencies (16 packages)
pnpm install
```

---

## 2. Verify the Installation

Run the full test suite to confirm everything is working:

```bash
pnpm -r test --run
```

Expected output: **923 tests passing** across 16 packages.

---

## 3. Choose Your Entry Point

OpenWeave has three ways to interact with it:

### Option A — CLI (simplest)

```bash
# Initialize a new project
pnpm --filter weave-cli dev init my-project

# Query the knowledge graph
pnpm --filter weave-cli dev query "TypeScript generics"

# Check for orphan code
pnpm --filter weave-cli dev orphans ./src
```

### Managing Skills

```bash
# List all available skill modules
weave skills list

# Enable a skill
weave skills enable code-review

# Disable a skill
weave skills disable code-review

# Show skill details
weave skills info test-gen
```

Available skills: `auto-fix` · `code-review` · `test-gen` · `docs-gen` · `refactor` · `pipeline-aware` · `dep-audit` · `perf-profile` · `container-advisor` · `deploy-provision` · `onboarding` · `commit-composer` · `context-memory` · `multi-repo` · `cli-interactive`

See [skill-package-setup.md](./skill-package-setup.md) for adding custom skills.

### Registering External Tools

```bash
# List registered tools
weave tools list

# Register a tool from a local manifest file
weave tools add .weave/tools/my-tool.tool.json

# Register a tool from a remote URL
weave tools add https://example.com/tools/manifest.json

# Show tool details and available actions
weave tools info my-tool

# Test a tool action
weave tools test my-tool action-name --args='{"key":"value"}'

# Remove a tool
weave tools remove my-tool
```

Tool manifests are stored in `.weave/tools/<id>.tool.json`. Supported adapters:
- **http** — REST/webhook endpoints (bearer, api-key, basic auth)
- **mcp** — JSON-RPC 2.0 bridge to external MCP servers
- **script** — local `bash`/`python`/`node` scripts (reads JSON from stdout)

### Option B — MCP Server (for AI clients)

Start the WeaveLink MCP server and connect any MCP-compatible client:

```bash
# stdio mode (default — for Claude Desktop, Cursor, Cline)
pnpm --filter weave-link dev start

# HTTP mode (for dashboard and REST access)
pnpm --filter weave-link dev start --mode http --port 3000
```

See [mcp-integration.md](./mcp-integration.md) for client configuration.

### Option C — Direct API (for code integration)

```typescript
import { ContextGraphManager, NodeBuilder, SynapticEngine } from "@openweave/weave-graph";

const graph = new ContextGraphManager("my-session");

// Enable neuronal retroactive linking
const engine = new SynapticEngine({ threshold: 0.72 });
graph.setSynapticEngine(engine);

// Add nodes — retroactive linking fires automatically
graph.addNode(NodeBuilder.concept("TypeScript generics", "Type system fundamentals"));
graph.addNode(NodeBuilder.concept("Generic constraints", "extends keyword in TypeScript"));

// Query
const results = graph.queryNodesByLabel("generics");
console.log(results);
```

---

## 4. Configure Storage (optional)

By default, OpenWeave persists data as JSON files. Switch backends with a single
environment variable:

```bash
# .env
WEAVE_PROVIDER=sqlite      # Embedded SQLite (recommended for CLI)
WEAVE_PROVIDER=json        # JSON files (default)
WEAVE_PROVIDER=mongodb     # MongoDB
WEAVE_PROVIDER=postgres    # PostgreSQL / PGlite
WEAVE_PROVIDER=mysql       # MySQL / MariaDB
```

For SQLite (zero setup):

```bash
WEAVE_PROVIDER=sqlite WEAVE_SQLITE_PATH=./openweave.db pnpm --filter weave-link dev start
```

For MongoDB:

```bash
WEAVE_PROVIDER=mongodb WEAVE_MONGO_URI=mongodb://localhost:27017/openweave pnpm --filter weave-link dev start
```

---

## 5. Run the Dashboard

The Weave Dashboard provides a visual interface for your knowledge graph:

```bash
# Start the WeaveLink HTTP server first
pnpm --filter weave-link dev start --mode http --port 3000 &

# Start the dashboard (Vite dev server, proxies to :3000)
pnpm --filter weave-dashboard dev
```

Open `http://localhost:5173` to view:
- 🧠 **Graph view** — force-directed D3 graph of all nodes and edges
- 🗺️ **Milestones** — Kanban board of your project's WeavePath plan
- ⚠️ **Errors** — error registry with CORRECTS edge cross-references
- 🔀 **Session Diff** — compare two snapshots of the graph over time

---

## 6. Development Workflow

OpenWeave uses **GitFlow**. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full
branching guide. Quick reference:

```bash
# Initialize GitFlow in your fork (one-time)
git flow init -d

# Start a feature
git flow feature start my-feature

# Run tests before committing
pnpm -r test --run

# Finish and merge into develop
git flow feature finish my-feature
```

---

## Next Steps

| Guide | Description |
|---|---|
| [architecture.md](./architecture.md) | How all packages interconnect |
| [weave-graph.md](./weave-graph.md) | WeaveGraph API, SynapticEngine, HebbianWeights |
| [mcp-integration.md](./mcp-integration.md) | Connecting Claude, Cursor, and Cline |
| [sentinel-agent.md](./sentinel-agent.md) | Security audits with the Sentinel agent |
| [skill-package-setup.md](./skill-package-setup.md) | Adding new packages to the monorepo |
| [ROADMAP.md](../ROADMAP.md) | Full development plan and milestone history |
