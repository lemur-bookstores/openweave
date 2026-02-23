# 🔌 MCP Integration Guide

> WeaveLink exposes OpenWeave as a **Model Context Protocol (MCP)** server,
> making its full knowledge graph accessible to any MCP-compatible AI client —
> Claude Desktop, Cursor, Cline, and more.

---

## Overview

```
AI Client (Claude / Cursor / Cline)
         │
   MCP Protocol (stdio or HTTP)
         │
   ┌─────▼──────────┐
   │  WeaveLinkServer│
   │  (weave-link)   │
   └──┬──────────┬───┘
      │          │
  WeaveGraph  WeavePath
  (memory)    (planner)
```

---

## Transport Modes

### stdio (default)

Recommended for desktop AI clients. The server process is started and managed by the client.

```bash
# Start in stdio mode
pnpm --filter weave-link dev start
# or after build:
node packages/weave-link/dist/index.js
```

### HTTP

Recommended for the dashboard, REST clients, and CI pipelines.

```bash
# Default port 3000, auth enabled
pnpm --filter weave-link dev start --mode http

# Custom port, no auth (local dev only)
pnpm --filter weave-link dev start --mode http --port 4000 --no-auth

# Custom host (expose to network)
pnpm --filter weave-link dev start --mode http --host 0.0.0.0 --port 3000
```

---

## Connecting AI Clients

### Claude Desktop

Edit `~/.config/claude/claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openweave": {
      "command": "node",
      "args": ["/absolute/path/to/openweave/packages/weave-link/dist/index.js"],
      "env": {
        "WEAVE_PROVIDER": "sqlite",
        "WEAVE_SQLITE_PATH": "/absolute/path/openweave.db"
      }
    }
  }
}
```

**Auto-install** (recommended):

```bash
weave-link install claude
```

This command merges the server entry into your existing Claude config without
overwriting other servers.

---

### Cursor

**Global** (available in all projects):

```bash
weave-link install cursor
```

**Project-scoped** (creates `.cursor/mcp.json`):

```bash
weave-link install cursor --scope project
```

Manual configuration in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openweave": {
      "command": "npx",
      "args": ["-y", "@openweave/weave-link"],
      "env": {
        "WEAVE_PROVIDER": "json",
        "OPENWEAVE_STORAGE": "./openweave-sessions"
      }
    }
  }
}
```

---

### Cline / VS Code

Add to your VS Code settings or workspace `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "openweave": {
      "command": "node",
      "args": ["${workspaceFolder}/packages/weave-link/dist/index.js"]
    }
  }
}
```

---

### Any HTTP-compatible client

```bash
# Generate an API key
weave-link keygen

# Use the key in requests
curl -H "Authorization: Bearer <your-key>" http://localhost:3000/tools
```

---

## Available MCP Tools

| Tool | Description | Key parameters |
|---|---|---|
| `save_node` | Add or update a node in the knowledge graph | `label`, `type`, `description`, `chatId` |
| `query_graph` | Search the graph by keyword | `query`, `chatId`, `limit` |
| `suppress_error` | Mark an error with its correction | `errorLabel`, `correction`, `chatId` |
| `update_roadmap` | Track milestone and sub-task progress | `milestoneId`, `status`, `chatId` |
| `get_session_context` | Retrieve the full session state | `chatId` |
| `get_next_action` | Get the recommended next sub-task | `chatId` |
| `list_orphans` | Detect unused exports in a project | `projectPath`, `language` |

### Example — saving a node

```json
{
  "name": "save_node",
  "arguments": {
    "label": "SynapticEngine retroactive linking",
    "type": "CONCEPT",
    "description": "Connects new nodes to historically similar nodes via Jaccard similarity",
    "chatId": "session-2026-02-23"
  }
}
```

### Example — querying the graph

```json
{
  "name": "query_graph",
  "arguments": {
    "query": "typescript generics",
    "chatId": "session-2026-02-23",
    "limit": 5
  }
}
```

---

## Authentication (HTTP mode)

WeaveLink uses **API key authentication** in HTTP mode.

### Generate a key

```bash
weave-link keygen
# ✅ API key generated: owk_a1b2c3d4e5f6...
```

### Use the key

```bash
# Via Authorization header (recommended)
curl -H "Authorization: Bearer owk_a1b2c3d4e5f6" http://localhost:3000/health

# Via X-API-Key header
curl -H "X-API-Key: owk_a1b2c3d4e5f6" http://localhost:3000/tools
```

### Manage keys at runtime

```typescript
import { AuthManager } from "@openweave/weave-link";

const auth = new AuthManager();
const key = auth.addKey();  // generates and registers a new key
auth.removeKey(key);        // revoke a key
auth.disable();             // disable auth entirely (local dev)
```

### Disable auth (local development only)

```bash
weave-link start --mode http --no-auth
```

---

## REST API Reference (HTTP mode)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | Server info and version |
| `GET` | `/health` | No | Liveness check |
| `GET` | `/tools` | **Yes** | List all available tools |
| `POST` | `/tools/call` | **Yes** | Invoke a tool |
| `GET` | `/events` | **Yes** | SSE stream of graph events |

### POST /tools/call

```bash
curl -X POST http://localhost:3000/tools/call \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "query_graph",
    "arguments": { "query": "generics", "chatId": "my-session" }
  }'
```

Response:

```json
{
  "success": true,
  "result": {
    "nodes": [
      { "id": "...", "label": "TypeScript generics", "type": "CONCEPT" }
    ]
  }
}
```

---

## Docker Deployment

A production-ready Docker image is published to GitHub Container Registry:

```bash
docker pull ghcr.io/openweave/weave-link:latest
```

Run the server:

```bash
docker run -d \
  -p 3000:3000 \
  -e WEAVE_PROVIDER=sqlite \
  -e WEAVE_SQLITE_PATH=/data/openweave.db \
  -v $(pwd)/data:/data \
  ghcr.io/openweave/weave-link:latest \
  start --mode http --host 0.0.0.0
```

The image is a multi-stage build (`node:22-alpine`) supporting `linux/amd64`
and `linux/arm64`. New images are pushed automatically on `main` and semver tags.

---

## SSE Events Stream

Subscribe to real-time graph events:

```javascript
const source = new EventSource("http://localhost:3000/events", {
  headers: { "Authorization": "Bearer <key>" }
});

source.addEventListener("node:added", (e) => {
  const node = JSON.parse(e.data);
  console.log("New node:", node.label);
});

source.addEventListener("edge:created", (e) => {
  const edge = JSON.parse(e.data);
  if (edge.metadata?.synapse) {
    console.log("Synaptic link:", edge.metadata.similarity);
  }
});
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Client can't connect | Verify the server is running: `weave-link status` |
| `401 Unauthorized` | Check API key in `Authorization: Bearer <key>` header |
| Tool returns empty results | Confirm `chatId` matches the session that has data |
| High latency on first query | `weave-embed` is loading the ML model — subsequent calls are cached |
| SQLite `SQLITE_CANTOPEN` | Ensure the `WEAVE_SQLITE_PATH` directory exists and is writable |

---

## Related Docs

- [getting-started.md](./getting-started.md) — Full setup guide
- [architecture.md](./architecture.md) — How WeaveLink fits into the system
- [weave-graph.md](./weave-graph.md) — Knowledge graph API reference
