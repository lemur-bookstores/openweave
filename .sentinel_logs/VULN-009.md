# VULN-009 — Authentication Disabled by Default in HttpTransport

**Risk Level:** HIGH  
**Status:** Detected  
**Component:** `packages/weave-link/src/http-transport.ts`  
**Line:** `HttpTransport` constructor

---

## Description

`HttpTransport` instantiates `AuthManager` with `enabled: false` by default:

```typescript
constructor(
  weaveLinkServer?: WeaveLinkServer,
  auth?: AuthManager,
  config?: HttpTransportConfig
) {
  this.auth = auth || new AuthManager({ enabled: false }); // ← auth OFF by default
  ...
}
```

This means that if a developer starts the HTTP server without explicitly
constructing and passing an `AuthManager`, **every endpoint — including
`POST /tools/call` — is completely unauthenticated**.

The Docker `CMD` also does not pass `--api-key`, relying entirely on the
operator to inject `WEAVE_API_KEY` at runtime without enforcing it:

```dockerfile
CMD ["node", "dist/cli.js", "start", "--host", "0.0.0.0", "--port", "3001", "--verbose"]
```

There is no startup guard that prevents the server from accepting connections
when no API key has been configured.

---

## Impact

- **Unauthenticated remote code-like execution** — any caller can invoke
  `save_node`, `query_graph`, `update_roadmap` without a token.
- **Full data exfiltration** from graph store.
- **Session poisoning** — attacker writes arbitrary nodes into any `chat_id`'s
  session cache.

---

## Remediation

### Immediate Action
Change the default to `enabled: true` and enforce at least one key:

```typescript
this.auth = auth || new AuthManager({ enabled: true, apiKeys: [] });
```

Add a startup guard in `HttpTransport.start()`:

```typescript
async start(): Promise<void> {
  if (this.auth.isEnabled() && this.auth.getKeyCount() === 0) {
    throw new Error(
      '[WeaveLink] Cannot start HTTP server: auth is enabled but no API keys are configured. ' +
      'Set WEAVE_API_KEY or pass apiKeys to AuthManager.'
    );
  }
  ...
}
```

### Hardening
1. In the Docker image, add a shell-level guard at `ENTRYPOINT`:
   ```dockerfile
   ENTRYPOINT ["/bin/sh", "-c", "[ -n \"$WEAVE_API_KEY\" ] || (echo 'FATAL: WEAVE_API_KEY is not set' && exit 1); exec node dist/cli.js start ..."]
   ```
2. Document in `README` and `.env.example` that `WEAVE_API_KEY` is **required**
   when running in HTTP mode.

---

## Verification

Start the server with no `WEAVE_API_KEY`.
`curl -X POST http://localhost:3001/tools/call -d '{"tool":"query_graph","args":{"chat_id":"x","query":"y"}}'`
Expected: `401 Unauthorized`. Actual (current): `200 OK`.
