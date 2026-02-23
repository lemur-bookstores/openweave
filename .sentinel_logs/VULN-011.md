# VULN-011 — Unbounded SSE Client Connections (Memory Exhaustion)

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/http-transport.ts`  
**Method:** `handleSSE()`

---

## Description

The SSE endpoint accepts an unlimited number of concurrent client connections,
storing each one in `this.sseClients: Map<string, SSEClient>`:

```typescript
private handleSSE(req: IncomingMessage, res: ServerResponse): void {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // ...
  this.sseClients.set(clientId, { id: clientId, res });  // no cap
}
```

Each connected SSE client holds an open TCP connection and an entry in the Map.
An attacker can open thousands of concurrent connections, causing:
- File descriptor exhaustion
- Heap growth from the `Map` and `ServerResponse` objects
- Node.js event-loop congestion during `broadcast()` (iterates all clients)

---

## Impact

- **Denial of service** — server becomes unresponsive under connection flood.
- **Memory leak** — if `close` events are missed (e.g., behind a proxy),
  the `VULN-010` code path shows stale clients are cleaned up lazily only
  during `broadcast()`, meaning idle clients accumulate indefinitely.

---

## Remediation

### Immediate Action
Add a `maxClients` cap and reject connections beyond the limit:

```typescript
private readonly MAX_SSE_CLIENTS = 100;

private handleSSE(req: IncomingMessage, res: ServerResponse): void {
  if (this.sseClients.size >= this.MAX_SSE_CLIENTS) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SSE connection limit reached' }));
    return;
  }
  // ... existing logic
}
```

### Hardening
1. Add a per-IP connection rate limit (e.g., max 5 SSE connections per IP).
2. Send a heartbeat `ping` event every 30s and forcefully close connections
   that fail to acknowledge within a timeout window.

---

## Verification

Open 101 concurrent SSE connections.
Assert that the 101st receives `503` and the server process memory remains stable.
