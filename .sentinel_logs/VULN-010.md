# VULN-010 — Unbounded Request Body Size (Denial of Service)

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/http-transport.ts`  
**Method:** `readBody()`

---

## Description

`readBody()` accumulates all incoming request chunks into a `Buffer[]` array
with no size limit:

```typescript
private readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));  // no limit
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
```

An attacker can POST a body of several hundred megabytes, exhausting Node.js
heap memory and causing an Out-Of-Memory crash.

This is exacerbated by VULN-003 (unbounded `metadata`) and VULN-002
(no field length limits).

---

## Impact

- **Denial of service** — a single HTTP request with a large body can OOM the
  process.
- **Memory amplification** — the body is held in RAM as `Buffer[]`, then
  concatenated (doubles peak memory), then `JSON.parse`d (another copy).

---

## Remediation

### Immediate Action
Add a 1 MB hard limit in `readBody()`:

```typescript
private readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        req.destroy();
        return reject(new Error('Request body too large'));
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
```

Return HTTP `413 Payload Too Large` on rejection.

### Hardening
1. Set `server.maxRequestsPerSocket` and a socket `timeout` to limit
   slow-loris style attacks.
2. Use a reverse proxy (nginx) in front of the container with
   `client_max_body_size 1m`.

---

## Verification

```bash
python3 -c "print('A' * 5_000_000)" | \
  curl -X POST http://localhost:3001/tools/call \
       -H 'Content-Type: application/json' --data-binary @-
```
Expected: `413`. Actual (current): server buffers and attempts `JSON.parse`.
