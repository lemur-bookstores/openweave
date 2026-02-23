# VULN-007 — Empty `.env.example` (No Secret Documentation)

**Risk Level:** LOW  
**Status:** Detected  
**Component:** `.env.example` (repo root)

---

## Description

The `.env.example` file is completely empty. It provides no guidance on which
environment variables are required to run the project, which ones are sensitive,
or what format/length they should follow.

The `.gitignore` correctly excludes `.env` and `.env.*`, so the actual secrets
file is never committed. However, without `.env.example`:
- New contributors have no reference for which env vars to set.
- Variables like `WEAVE_API_KEY`, `WEAVE_PORT`, `WEAVE_HOST`, or provider
  connection strings (MongoDB URL, SQLite path) may be configured incorrectly.
- It is trivially possible for a developer to accidentally commit a real `.env`
  file in the future when there is no documented pattern to follow.

---

## Impact

- Misconfiguration leading to auth being disabled in production
  (see VULN-009 — `AuthManager` defaults to `enabled: false`).
- New deployments run without API key protection.

---

## Remediation

### Immediate Action
Populate `.env.example` with all configurable variables, marked as examples:

```bash
# ─── WeaveLink HTTP Transport ────────────────────────────────────────
# Port the HTTP server listens on (default: 3001)
WEAVE_PORT=3001

# Host binding. Use 127.0.0.1 for local-only, 0.0.0.0 for container.
WEAVE_HOST=127.0.0.1

# API key for authenticating HTTP requests (required in production).
# Generate with: node -e "const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';const b=new Uint8Array(32);crypto.getRandomValues(b);console.log(Array.from(b,x=>c[x%62]).join(''))"
WEAVE_API_KEY=CHANGE_ME_BEFORE_SHIPPING

# ─── LLM Provider ────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...

# ─── Storage Provider ────────────────────────────────────────────────
# sqlite | mongodb
WEAVE_PROVIDER=sqlite
WEAVE_SQLITE_PATH=./weave.db
WEAVE_MONGODB_URI=mongodb://localhost:27017/openweave
```

---

## Verification

Open the repository as a new contributor and confirm that `.env.example`
documents every env var referenced in the source code.
