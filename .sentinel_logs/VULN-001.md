# VULN-001 — Information Disclosure via Raw Tool-Arg Logging

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/mcp-server.ts`  
**Line:** ~65 (`callTool` method)

---

## Description

`WeaveLinkServer.callTool()` logs the full `args` object to stdout before
dispatching to a handler:

```typescript
console.log(`[${this.config.name}] Executing tool: ${toolName}`, args);
```

`args` is typed as `Record<string, unknown>` and can contain:
- API keys or tokens passed as metadata
- User-supplied `node_label` / `node_id` values containing PII
- Free-form `metadata` objects with arbitrary key/value content

In a production environment with centralised log aggregation (Datadog,
Splunk, CloudWatch), these values are stored in plaintext and accessible to
anyone with log-read permissions.

---

## Impact

- PII / sensitive business data exposed in logs.
- Attacker with log-read access gains full visibility of every tool invocation.
- Violates GDPR Article 5(1)(f) (integrity and confidentiality principle).

---

## Remediation

### Immediate Action
Replace raw arg logging with a **sanitised** summary that only exposes safe fields:

```typescript
// Before
console.log(`[${this.config.name}] Executing tool: ${toolName}`, args);

// After
const safeSummary = { tool: toolName, chat_id: (args as any).chat_id ?? 'unknown' };
console.log(`[${this.config.name}] Executing tool:`, JSON.stringify(safeSummary));
```

### Hardening
1. Introduce a `redactArgs(args)` utility that strips any key matching a
   denylist (`/key|token|secret|password|metadata/i`) before logging.
2. Enable structured logging (e.g., `pino`) with a `redact` option so the
   scrubbing is centralised and cannot be bypassed by future developers.

---

## Verification

Invoke `callTool('save_node', { chat_id: 'x', node_id: 'y', metadata: { secret: 'TOP_SECRET' }})`.
Assert that `secret` does **not** appear in stdout.
