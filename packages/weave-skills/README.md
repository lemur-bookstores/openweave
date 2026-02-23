# @openweave/weave-skills

> **WeaveSkills** — Skill Module Registry (M19)  
> Pluggable skill architecture for the OpenWeave agent.

---

## Overview

WeaveSkills provides the **infrastructure** for registering, enabling and executing
optional skill modules in the OpenWeave agent.

Each skill is an independent module that implements the `SkillModule` interface.
The `SkillRegistry` manages lifecycle; `.weave.config.json` persists the enabled state.

```
.weave.config.json          ← per-project skill config
       │
       ▼
  SkillRegistry             ← runtime registry (in-memory)
  ├── register(module)
  ├── enable(id) / disable(id)
  ├── execute(id, context)
  └── executeAll(context)
```

---

## Usage

### Define a skill

```typescript
import type { SkillModule, SkillContext, SkillResult } from '@openweave/weave-skills';

export const mySkill: SkillModule = {
  id: 'my-skill',
  name: 'My Skill',
  description: 'Does something useful at agent runtime',
  version: '1.0.0',
  enabled: true,
  tags: ['dev'],
  async execute(ctx: SkillContext): Promise<SkillResult> {
    // ctx.files, ctx.graph, ctx.session, ctx.git are available
    return { success: true, output: 'All done.' };
  },
};
```

### Register and execute

```typescript
import { SkillRegistry, loadSkillConfig } from '@openweave/weave-skills';
import { mySkill } from './my-skill.js';

const registry = new SkillRegistry();
registry.register(mySkill);

// Apply persisted config (enables/disables from .weave.config.json)
const config = loadSkillConfig();
registry.loadFromConfig(config);

// Execute a single skill
const result = await registry.execute('my-skill', {
  projectRoot: process.cwd(),
  files: [],
  graph: null,
  session: null,
  git: null,
});
```

---

## CLI

Manage skills from the terminal via `weave skills`:

```bash
weave skills list                    # List all configured skills
weave skills enable auto-fix         # Enable a skill
weave skills disable code-review     # Disable a skill
weave skills info test-gen           # Show config entry for a skill
weave skills list --json             # Machine-readable output
```

Config is saved to `.weave.config.json` in the project root:

```json
{
  "skills": {
    "auto-fix": true,
    "code-review": false,
    "test-gen": true
  }
}
```

---

## API Reference

### `SkillRegistry`

| Method | Description |
|--------|-------------|
| `register(module)` | Register a skill (throws on duplicate id) |
| `replace(module)` | Register or overwrite a skill |
| `unregister(id)` | Remove a skill |
| `enable(id)` | Mark skill as enabled |
| `disable(id)` | Mark skill as disabled |
| `get(id)` | Get `RegisteredSkill` by id |
| `has(id)` | Check registration |
| `list()` | All skills (enabled + disabled) |
| `listEnabled()` | Only enabled skill modules |
| `execute(id, ctx)` | Execute one skill; throws if disabled |
| `executeSafe(id, ctx)` | Execute one skill; returns failed result instead of throwing |
| `executeAll(ctx)` | Execute all enabled skills; returns `Map<id, SkillResult>` |
| `loadFromConfig(cfg)` | Apply a `SkillConfig` to the registry |
| `toConfig()` | Serialize registry state to `SkillConfig` |

### Config helpers

| Function | Description |
|----------|-------------|
| `loadSkillConfig(root?)` | Read `.weave.config.json` → `SkillConfig` |
| `saveSkillConfig(cfg, root?)` | Write (merge) `SkillConfig` to file |
| `setSkillEnabled(id, enabled, root?)` | Toggle a single skill |
| `mergeSkillConfig(updates, root?)` | Merge partial updates |
| `configExists(root?)` | Check if config file exists |

---

## Phase 9 Skill IDs

The following skill ids are planned for M20–M22:

| Phase | Id | Description |
|-------|----|-------------|
| M20 | `auto-fix` | Apply VULN patches automatically |
| M20 | `code-review` | Structured review of `git diff HEAD` |
| M20 | `test-gen` | Generate missing Vitest unit tests |
| M20 | `docs-gen` | JSDoc + README + CHANGELOG generation |
| M20 | `refactor` | Code smell detection + diff preview |
| M21 | `pipeline-aware` | CI/CD log diagnosis |
| M21 | `dep-audit` | Dependency CVE + outdated detection |
| M21 | `perf-profile` | Build/test bottleneck analysis |
| M21 | `container-advisor` | Dockerfile best-practice audit |
| M21 | `deploy-provision` | Interactive production provisioning |
| M22 | `onboarding` | Interactive project tour |
| M22 | `commit-composer` | Conventional Commits message generation |
| M22 | `context-memory` | Cross-session architectural memory |
| M22 | `multi-repo` | Multi-repository reasoning |
| M22 | `cli-interactive` | REPL `weave chat` with all skills |
