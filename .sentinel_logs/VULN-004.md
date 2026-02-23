# VULN-004 — Missing `chat_id` Format Validation (Path Traversal Risk)

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/tools.ts`, `packages/weave-link/src/mcp-server.ts`  
**Field:** `chat_id`

---

## Description

`chat_id` is declared as a free-form string with no format validation:

```typescript
chat_id: {
  type: 'string',
  description: 'Unique identifier for the conversation or chat session',
},
```

`chat_id` is used as a session key in `getOrCreateSession(chat_id)` and could
in future releases be used to construct file paths (the `SessionLifecycle` class
already constructs paths like `<dir>/<sessionId>.session.json`).

A value such as `../../etc/passwd` or `../../../root/.ssh/authorized_keys` would
traverse the directory if the field is ever interpolated into a `join()` call
without sanitisation.

The `sessionId` field in `SessionLifecycle` currently uses its own ID, but
relying on this separation is a brittle assumption.

---

## Impact

- **Potential path traversal** — if `chat_id` is merged with `sessionId` or
  used directly in any file system operation.
- **Session confusion** — two paths that normalise to the same canonical path
  can overwrite each other's state.

---

## Remediation

### Immediate Action
Add a regex allowlist to the tool schema:

```typescript
chat_id: {
  type: 'string',
  pattern: '^[\\w\\-]{1,128}$',
  description: 'Alphanumeric + hyphens/underscores, 1–128 chars',
},
```

Validate in `handleSaveNode` (and all handlers) before use:

```typescript
if (!/^[\w\-]{1,128}$/.test(chat_id)) {
  return this.error('Invalid chat_id format');
}
```

### Hardening
In `SessionLifecycle.sessionPath()`, call `path.basename(sessionId)` before
`join()` to neutralise any traversal attempt unconditionally:

```typescript
private sessionPath(sessionId: string): string {
  return join(this.sessionsDir, `${path.basename(sessionId)}.session.json`);
}
```

---

## Verification

Call `save_node` with `chat_id: '../../../tmp/evil'`.
Assert that no file is created outside the sessions directory.
