# ⌨️ Weave CLI

> Command-line interface for OpenWeave intelligent agent framework

## Overview

**Weave CLI** is the command-line tool for interacting with OpenWeave locally. It provides commands to scaffold projects, track progress, and manage the agent's knowledge graph.

## Installation

```bash
npm install -g @openweave/weave-cli
```

Or use directly with npx:

```bash
npx @openweave/weave-cli --help
```

## Commands

### `weave init <project>`

Initialize a new OpenWeave project session.

```bash
weave init my-project
# Creates:
# - my-project/.weave/context.json (knowledge graph state)
# - my-project/ROADMAP.md (milestone tracker)
```

### `weave status`

Show current project status and milestones.

```bash
weave status
# Output:
# 🗺️ OpenWeave Project Status
# M1 · WeaveGraph Core        [✅ 100%]
# M2 · WeaveLint Core          [🔄 50%]
# M3 · WeavePath Core          [🔜 0%]
```

### `weave milestones`

List all milestones and sub-tasks.

```bash
weave milestones
# Shows detailed breakdown of all milestones
```

### `weave errors`

List error registry and correction patterns.

```bash
weave errors
# Shows common errors encountered and corrections applied
```

### `weave query <term>`

Search the knowledge graph.

```bash
weave query "authentication system"
# Returns nodes matching the query with relevance scores
```

### `weave save-node`

Manually add a node to the knowledge graph.

```bash
weave save-node --label "API Design Decision" --type DECISION
```

### `weave orphans`

Run code orphan detection on current project.

```bash
weave orphans --path ./src
# Shows unused functions, classes, and modules
```

## Configuration

Weave CLI uses `.weave/config.json` for project settings:

```json
{
  "project_name": "my-project",
  "knowledge_graph_path": ".weave/context.json",
  "roadmap_file": "ROADMAP.md",
  "include_tests": false,
  "max_context_depth": 2
}
```

## Environment Variables

- `WEAVE_PROJECT_ROOT` — Override project root directory
- `WEAVE_VERBOSE` — Enable verbose logging
- `WEAVE_DEBUG` — Enable debug mode

## Related Packages

- **@openweave/weave-graph** — Knowledge graph storage and retrieval
- **@openweave/weave-lint** — Code orphan detection
- **@openweave/weave-path** — Milestone planning
- **@openweave/weave-link** — MCP server for integrations
