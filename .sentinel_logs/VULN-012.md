# VULN-012 — Session File Path Traversal via Unsanitised `sessionId`

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `apps/agent-core/src/session-lifecycle.ts`  
**Method:** `sessionPath()`

---

## Description

`SessionLifecycle.sessionPath()` constructs a file path by directly
interpolating `sessionId` into a `join()` call:

```typescript
private sessionPath(sessionId: string): string {
  return join(this.sessionsDir, `${sessionId}.session.json`);
}
```

`sessionId` is accepted as a constructor parameter to `AgentCore` with no
format validation:

```typescript
this.config = {
  sessionId: config.sessionId ?? generateId('sess'),
  ...
};
```

A caller that constructs `new AgentCore(client, { sessionId: '../../../etc/cron.d/weave' })`
would cause `save()` to write a JSON file at an arbitrary path on the filesystem.

---

## Impact

- **Arbitrary file write** — session data written outside the sessions directory.
- Chained with `metadata` injection (VULN-002/003), the attacker controls
  both the file path and partial file contents.
- On Linux, writing to `/proc/self/environ` or similar pseudo-files could have
  unpredictable effects.

---

## Remediation

### Immediate Action
Apply `path.basename()` before join to strip any directory components:

```typescript
import { basename, join } from 'node:path';

private sessionPath(sessionId: string): string {
  const safe = basename(sessionId);  // strips all directory components
  return join(this.sessionsDir, `${safe}.session.json`);
}
```

Also validate `sessionId` format in `AgentCore` constructor:

```typescript
if (!/^[\w\-]{1,128}$/.test(config.sessionId)) {
  throw new Error(`Invalid sessionId: "${config.sessionId}"`);
}
```

### Hardening
Re-use the same regex allowlist as recommended for `chat_id` (VULN-004)
in a shared `validateIdentifier()` utility.

---

## Verification

```typescript
const lifecycle = new SessionLifecycle('/tmp/sessions');
lifecycle.save({ sessionId: '../../../tmp/evil', chatId: 'x', ... });
// Assert: no file created at /tmp/evil.session.json
// Assert: file created (or rejected) only inside /tmp/sessions/
```
