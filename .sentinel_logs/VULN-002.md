# VULN-002 — Missing Runtime Input Validation in Tool Handlers

**Risk Level:** HIGH  
**Status:** Detected  
**Component:** `packages/weave-link/src/mcp-server.ts`  
**Methods:** `handleSaveNode`, `handleSuppressError`, `handleUpdateRoadmap`

---

## Description

All tool handlers cast the raw `args` object with an unsafe `as unknown as <Type>`
pattern instead of validating schema at runtime:

```typescript
// handleSaveNode — no validation before use
const { node_id, node_label, node_type, metadata, frequency, chat_id } =
  args as unknown as SaveNodeArgs;
```

The only guard is a presence check (`if (!chat_id || !node_id || ...)`)
which does not verify:
- **Type correctness** — `frequency` could be a string, object, or negative number.
- **String length** — `node_label` and `node_id` are unbounded.
- **Allowed values** — `node_type` accepts any string; no enum enforcement.
- **Depth / nesting of `metadata`** — a deeply nested object causes unbounded
  JSON serialisation.

The fields are then stored directly into the session cache:

```typescript
(session as Record<string, unknown>).lastNode = {
  id: node_id,
  label: node_label,
  ...
  metadata,        // arbitrary attacker-controlled object
};
```

---

## Impact

- **Prototype pollution** — a malicious `metadata` payload such as
  `{"__proto__": {"isAdmin": true}}` can pollute the Node.js object prototype.
- **Memory amplification** — extremely long strings or deeply nested objects
  are stored without limits.
- **Type confusion** — downstream code that trusts the type annotations will
  behave incorrectly when e.g. `frequency` is `"NaN"` or `Infinity`.

---

## Remediation

### Immediate Action
Add a `validateSaveNodeArgs` function using `zod` or manual guards:

```typescript
import { z } from 'zod';

const SaveNodeSchema = z.object({
  chat_id: z.string().min(1).max(256).regex(/^[\w\-]+$/),
  node_id: z.string().min(1).max(256).regex(/^[\w\-]+$/),
  node_label: z.string().min(1).max(1024),
  node_type: z.enum(['CONCEPT', 'DECISION', 'MILESTONE', 'ERROR', 'MODULE', 'PATTERN']),
  frequency: z.number().int().min(1).max(10_000).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
```

Call `SaveNodeSchema.parse(args)` at the top of `handleSaveNode` and return an
error response on `ZodError`.

### Hardening
1. Apply a `MaxDepth` JSON schema restriction to `metadata`.
2. Sanitise string values with `DOMPurify` or a text-only strip before storage.

---

## Verification

Send `args = { chat_id: 'x', node_id: 'y', node_label: 'z', node_type: 'INVALID_TYPE' }`.
Expect a `400`-equivalent MCP error response, NOT a successful save.
