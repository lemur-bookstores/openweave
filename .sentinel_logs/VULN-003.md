# VULN-003 — Open Metadata Object Injection in Tool Schema

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/tools.ts`  
**Field:** `metadata` in `TOOL_SAVE_NODE` schema

---

## Description

The JSON schema for `save_node` defines `metadata` as an unconstrained object:

```typescript
metadata: {
  type: 'object',
  description: 'Additional metadata for the node',
},
```

There is no:
- `additionalProperties` restriction
- `maxProperties` limit
- Type constraint on property values (nested objects are allowed)

An LLM or a malicious caller can therefore send:

```json
{
  "metadata": {
    "__proto__": { "isAdmin": true },
    "hugepayload": "A".repeat(10_000_000)
  }
}
```

---

## Impact

- **Prototype pollution** when the metadata object is later spread or
  assigned to another plain object without `Object.create(null)` protection.
- **Memory exhaustion** — a 10 MB metadata string accepted unconditionally.
- **Semantic injection** — arbitrary key names can override convention-based
  fields used by downstream consumers.

---

## Remediation

### Immediate Action
Tighten the JSON schema:

```typescript
metadata: {
  type: 'object',
  additionalProperties: { type: 'string', maxLength: 512 },
  maxProperties: 20,
  description: 'Key/value string pairs. Max 20 keys, 512 chars per value.',
},
```

### Hardening
1. In `handleSaveNode`, use `Object.create(null)` when constructing the stored
   metadata to prevent prototype chain attacks.
2. Strip any key that starts with `__` (dunder prefix).

---

## Verification

POST `save_node` with `metadata: { "__proto__": { "x": 1 } }`.
Assert that `({}).x` is still `undefined` after the call.
