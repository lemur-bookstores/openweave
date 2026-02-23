# 🚨 Security Audit: OpenWeave Monorepo

**Audit Date:** 2025-07-16  
**Branch:** `feature/synaptic-engine`  
**Auditor:** Sentinel Security Unit  
**Risk Level:** ⚠️ HIGH (2 critical findings require immediate remediation before public release)

---

## Executive Summary

A full security audit of the OpenWeave monorepo was performed across all
packages. **14 vulnerabilities** were identified across 4 attack surfaces:
HTTP transport, MCP tool handlers, agent prompt architecture, and
infrastructure/configuration.

The most critical findings are:

| ID | Severity | Title |
|----|----------|-------|
| VULN-009 | 🔴 HIGH | Authentication disabled by default in HttpTransport |
| VULN-002 | 🔴 HIGH | Missing runtime input validation in tool handlers |
| VULN-005 | 🔴 HIGH | Stored prompt injection via graph node content |
| VULN-010 | 🟠 MEDIUM | Unbounded request body — Denial of Service |
| VULN-011 | 🟠 MEDIUM | Unbounded SSE clients — memory exhaustion |
| VULN-008 | 🟠 MEDIUM | CORS wildcard `*` enabled by default |
| VULN-003 | 🟠 MEDIUM | Open metadata object injection |
| VULN-004 | 🟠 MEDIUM | Missing `chat_id` format validation (path traversal) |
| VULN-012 | 🟠 MEDIUM | Session file path traversal via `sessionId` |
| VULN-001 | 🟡 LOW-MEDIUM | Raw tool-arg logging — information disclosure |
| VULN-006 | 🟡 LOW | System prompt publicly exported |
| VULN-007 | 🟡 LOW | Empty `.env.example` — no secret documentation |
| VULN-013 | 🟡 LOW | Biased modulo in `generateApiKey()` |
| VULN-014 | 🟡 LOW | `.sentinel_logs/` not in `.gitignore` |

---

## Audit Scope

| Surface | Files Audited |
|---------|---------------|
| MCP Tool Handlers | `packages/weave-link/src/mcp-server.ts` |
| MCP Tool Schemas | `packages/weave-link/src/tools.ts` |
| HTTP Transport | `packages/weave-link/src/http-transport.ts` |
| Authentication | `packages/weave-link/src/auth.ts` |
| Agent System Prompt | `apps/agent-core/src/system-prompt.ts` |
| ReAct Loop | `apps/agent-core/src/agent-core.ts` |
| Session Persistence | `apps/agent-core/src/session-lifecycle.ts` |
| Storage Provider | `packages/weave-provider-sqlite/src/sqlite-provider.ts` |
| Container Hardening | `packages/weave-link/Dockerfile` |
| CI/CD Secrets | `.github/workflows/docker.yml` |
| Secret Management | `.env.example`, `.gitignore` |

---

## Phase 1 — Reconnaissance Findings

### Attack Surface Map

```
Internet
  │
  ▼
╔═══════════════════════════════════╗
║  HttpTransport (port 3001)        ║  ← VULN-008 (CORS *), VULN-010 (no body limit)
║    GET  /                  publik  ║
║    GET  /health            publik  ║
║    GET  /tools             auth   ║  ← VULN-009 (auth OFF by default)
║    POST /tools/call        auth   ║  ← VULN-009, VULN-002, VULN-003, VULN-004
║    GET  /events            auth   ║  ← VULN-011 (unlimited SSE clients)
╚═══════════════════════════════════╝
  │
  ▼
╔═══════════════════════════════════╗
║  WeaveLinkServer                  ║
║    callTool(name, args)           ║  ← VULN-001 (log disclosure)
║    handleSaveNode(args)           ║  ← VULN-002 (no validation), VULN-003, VULN-004
╚═══════════════════════════════════╝
  │
  ▼
╔═══════════════════════════════════╗
║  Session Cache (in-memory Map)    ║
║  → future: SessionLifecycle.save  ║  ← VULN-012 (path traversal via sessionId)
╚═══════════════════════════════════╝
  │
  ▼
╔═══════════════════════════════════╗
║  AgentCore (ReAct loop)           ║
║    SystemPromptBuilder.build()    ║  ← VULN-005 (prompt injection)
║    config.llm.apiKey (in-memory)  ║  ← LLM key exposure risk
╚═══════════════════════════════════╝
```

### Positive Security Findings

The following security controls are correctly implemented and should be maintained:

- ✅ **Two-stage Docker build** — build artefacts are not included in the
  production image; only the deployed bundle is copied.
- ✅ **Non-root Docker user** — `USER weave` is set in the production stage.
- ✅ **Strict GHCR auth** — `docker.yml` uses `secrets.GITHUB_TOKEN`, no
  custom secrets exposed in CI.
- ✅ **`.env` gitignored** — `.env` and `.env.*` are correctly excluded.
- ✅ **PreparedStatements in SQLite** — `SqliteProvider` uses pre-compiled
  `StatementSync` objects, preventing SQL injection.
- ✅ **AuthManager key comparison** — `includes()` is used for exact match
  (no prefix matching vulnerability).
- ✅ **No WEAVE_API_KEY in Dockerfile ENV** — the key must be injected at
  runtime, not baked into the image layer.

---

## Phase 2 — Vulnerability Analysis

### 🔴 Critical Path (must fix before production)

#### 1. Unauthenticated HTTP API (VULN-009)

The HTTP transport starts with auth **disabled** by default. Any caller on the
network can invoke all tools without a token.

**Fix:** Change `AuthManager` default to `enabled: true`, add startup guard
that throws if no API keys are configured.

#### 2. No Runtime Input Validation (VULN-002)

Tool args are cast with `as unknown as Type` — no schema validation occurs at
runtime. Prototype pollution, memory amplification, and type confusion are all
possible.

**Fix:** Integrate `zod` schemas that parse and validate every tool's args
before the handler executes.

#### 3. Stored Prompt Injection (VULN-005)

Graph node labels are injected verbatim into the LLM system prompt. A stored
node can hijack the agent's behavior for all future sessions.

**Fix:** Wrap graph data in an `<untrusted>` block with explicit instructions
not to follow embedded commands. Sanitise node labels with a denylist.

---

### 🟠 Medium Risk (fix before public beta)

| ID | Fix Summary |
|----|-------------|
| VULN-008 | Default CORS to `false`; require explicit allowlist |
| VULN-010 | Add 1 MB body limit in `readBody()` |
| VULN-011 | Cap SSE clients at 100; reject with 503 when exceeded |
| VULN-003 | Restrict `metadata` to `Record<string, string>`, max 20 keys |
| VULN-004 | Add `pattern: '^[\\w\\-]{1,128}$'` to `chat_id` schema |
| VULN-012 | Apply `path.basename(sessionId)` in `sessionPath()` |

---

### 🟡 Low Risk (fix in upcoming hardening sprint)

| ID | Fix Summary |
|----|-------------|
| VULN-001 | Sanitise args before logging; use structured logger with redact |
| VULN-006 | Remove `OPENWEAVE_BASE_PROMPT` from public barrel exports |
| VULN-007 | Populate `.env.example` with all required variables |
| VULN-013 | Replace biased-modulo key generator with rejection sampling |
| VULN-014 | Add `.sentinel_logs/` and `.weave-sessions/` to `.gitignore` |

---

## Phase 3 — Remediation Priority

### Sprint 1 (Before any public HTTP deployment)
1. Fix VULN-009 — enable auth by default, add startup guard
2. Fix VULN-002 — add zod validation to all tool handlers
3. Fix VULN-005 — wrap graph context in untrusted delimiters
4. Fix VULN-010 — add body size limit in `readBody()`

### Sprint 2 (Before public beta)
5. Fix VULN-008 — CORS default to false
6. Fix VULN-011 — SSE client cap
7. Fix VULN-003 — metadata schema constraints
8. Fix VULN-004 — chat_id / sessionId format validation
9. Fix VULN-012 — `path.basename()` in sessionPath

### Sprint 3 (Hardening)
10. Fix VULN-001 — structured logging with redaction
11. Fix VULN-006 — remove system prompt from public API
12. Fix VULN-007 — populate `.env.example`
13. Fix VULN-013 — unbiased key generation
14. Fix VULN-014 — update `.gitignore`

---

## Evidence (WeaveTrace)

All individual findings are documented in this directory:

| File | Finding |
|------|---------|
| [VULN-001.md](VULN-001.md) | Raw tool-arg logging |
| [VULN-002.md](VULN-002.md) | Missing runtime input validation |
| [VULN-003.md](VULN-003.md) | Open metadata object injection |
| [VULN-004.md](VULN-004.md) | chat_id path traversal |
| [VULN-005.md](VULN-005.md) | Stored prompt injection |
| [VULN-006.md](VULN-006.md) | System prompt public export |
| [VULN-007.md](VULN-007.md) | Empty .env.example |
| [VULN-008.md](VULN-008.md) | CORS wildcard default |
| [VULN-009.md](VULN-009.md) | Auth disabled by default |
| [VULN-010.md](VULN-010.md) | Unbounded request body DoS |
| [VULN-011.md](VULN-011.md) | Unbounded SSE connections |
| [VULN-012.md](VULN-012.md) | Session path traversal |
| [VULN-013.md](VULN-013.md) | Biased API key generation |
| [VULN-014.md](VULN-014.md) | .sentinel_logs not gitignored |

---

*Sentinel Security Unit — automated audit via WeaveTrace protocol*
