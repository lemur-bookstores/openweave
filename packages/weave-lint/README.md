# 🔌 weave-link

> **WeaveLink** — The MCP Server that connects OpenWeave to any compatible AI client.

Part of the [OpenWeave](../../README.md) monorepo.

---

## What it does

WeaveLink implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
to expose OpenWeave's memory and planning tools to any compatible client:

- **Claude Desktop** — native MCP support
- **Cursor** — via MCP config
- **Cline** — via MCP config
- **Any MCP-compatible client**

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `save_graph_node` | Persist a memory node (concept, decision, error) to the session graph |
| `query_graph` | Retrieve nodes relevant to a query from long-term memory |
| `suppress_node` | Mark a node as erroneous and record its correction |
| `update_roadmap` | Write the current milestone plan to `roadmap.md` |
| `get_session_context` | Load full session state: graph summary + roadmap + error patterns |

---

## Quick Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openweave": {
      "command": "npx",
      "args": ["-y", "@openweave/weave-link"],
      "env": {
        "OPENWEAVE_STORAGE": "/path/to/your/sessions"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "openweave": {
      "command": "npx",
      "args": ["-y", "@openweave/weave-link"],
      "env": {
        "OPENWEAVE_STORAGE": "./.openweave"
      }
    }
  }
}
```

### Cline (VS Code)

In Cline settings → MCP Servers → Add:

```json
{
  "name": "openweave",
  "command": "npx -y @openweave/weave-link",
  "env": { "OPENWEAVE_STORAGE": "./.openweave" }
}
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENWEAVE_STORAGE` | `./openweave-sessions` | Root directory for session persistence |
| `OPENWEAVE_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

---

## Docker

```bash
docker run -v $(pwd)/sessions:/sessions \
  -e OPENWEAVE_STORAGE=/sessions \
  ghcr.io/openweave/weave-link:latest
```

---

## Installation

```bash
# Use directly via npx (no install needed)
npx @openweave/weave-link

# Or install globally
npm install -g @openweave/weave-link
weave-link start
```