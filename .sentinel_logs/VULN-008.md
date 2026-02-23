# VULN-008 — CORS Wildcard (`*`) Enabled by Default

**Risk Level:** MEDIUM  
**Status:** Detected  
**Component:** `packages/weave-link/src/http-transport.ts`  
**Line:** `HttpTransport` constructor, `cors` default

---

## Description

`HttpTransport` defaults to `cors: true`, which sets the header:

```
Access-Control-Allow-Origin: *
```

for every response, including the authenticated `POST /tools/call` endpoint:

```typescript
this.config = {
  port: config?.port ?? 3001,
  host: config?.host ?? '127.0.0.1',
  cors: config?.cors ?? true,   // ← wildcard CORS on by default
  ...
};
```

With a wildcard CORS policy, any webpage on the internet can make
cross-origin requests to the server. If a user with a `WEAVE_API_KEY`
in their browser's local storage visits a malicious page, that page can
silently invoke any tool on their behalf (CSRF-like attack in a SPA context).

Even if the API key is required, browsers will send back the response to
the malicious origin, enabling cross-origin data exfiltration.

---

## Impact

- **Cross-origin tool invocation** from any website.
- **Response data exfiltration** — graph contents readable by third-party origins.

---

## Remediation

### Immediate Action
Change the default to `cors: false`:

```typescript
cors: config?.cors ?? false,
```

When CORS is needed (e.g., VS Code webview, local dashboard), Require callers
to explicitly pass `cors: true` or a specific origin allowlist.

### Hardening
Replace the `boolean` cors option with a `string | string[] | boolean` type
so trusted origins can be explicitly enumerated:

```typescript
if (this.config.cors === true) {
  res.setHeader('Access-Control-Allow-Origin', '*');
} else if (typeof this.config.cors === 'string') {
  res.setHeader('Access-Control-Allow-Origin', this.config.cors);
} else if (Array.isArray(this.config.cors)) {
  const origin = req.headers['origin'];
  if (origin && (this.config.cors as string[]).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}
```

---

## Verification

Start the server with default config. Use `curl -H "Origin: https://evil.com"`.
Assert that `Access-Control-Allow-Origin` is absent or does NOT equal `*`.
