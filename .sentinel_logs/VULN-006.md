# VULN-006 — System Prompt Publicly Exported from Package Barrel

**Risk Level:** LOW  
**Status:** Detected  
**Component:** `apps/agent-core/src/index.ts`  
**Export:** `OPENWEAVE_BASE_PROMPT`

---

## Description

The complete system prompt constant `OPENWEAVE_BASE_PROMPT` is re-exported
from the package's public barrel file:

```typescript
// apps/agent-core/src/index.ts
export { OPENWEAVE_BASE_PROMPT } from './system-prompt.js';
```

Any consumer that installs `@openweave/agent-core` (or accesses its
`node_modules`) can retrieve the full text of the system prompt, including:
- Tool-calling instructions
- Context management rules
- Any safety guardrails or internal heuristics

Knowledge of the exact system prompt significantly reduces the effort required
for a targeted prompt-injection attack (see VULN-005).

---

## Impact

- **Attack surface amplification** — attacker gains a precise map of the
  agent's instruction set, making injection far easier to craft.
- **Competitive disclosure** — the system prompt may contain proprietary
  business logic.

---

## Remediation

### Immediate Action
Remove `OPENWEAVE_BASE_PROMPT` from the public barrel:

```typescript
// Remove this line from index.ts
// export { OPENWEAVE_BASE_PROMPT } from './system-prompt.js';
```

Keep `SystemPromptBuilder` exported so callers can build prompts without
directly reading the template.

### Hardening
Mark the constant with a `@internal` JSDoc tag so bundlers and doc generators
exclude it, and add a lint rule (`no-restricted-exports`) to prevent future
accidental re-exports of internal constants.

---

## Verification

Run `node -e "const m = require('@openweave/agent-core'); console.log(typeof m.OPENWEAVE_BASE_PROMPT)"`.
Expected: `undefined`.
