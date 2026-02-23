# VULN-014 — `.sentinel_logs/` Not Listed in `.gitignore`

**Risk Level:** LOW  
**Status:** Detected  
**Component:** `.gitignore` (repo root)

---

## Description

The `.sentinel_logs/` directory created by the Sentinel audit protocol is not
listed in `.gitignore`. This means:
- Running `git add .` will stage all audit log files.
- Security findings (VULN-*.md) containing detailed attack vectors and
  remediation steps could be unintentionally committed and pushed to a public
  repository, providing a ready-made exploitation guide to attackers.

Additionally, session data directories `.weave-sessions/` (used by
`SessionLifecycle`) are listed under the name `openweave-sessions/` and
`.openweave/`, but **not** under the default value `.weave-sessions`. If a
developer runs `AgentCore` with the default `persistenceDir`, the session
files will not be gitignored.

---

## Impact

- Public disclosure of security audit findings before remediation.
- Session files (containing `sessionId`, `chatId`, turn counts) committed
  to version control.

---

## Remediation

### Immediate Action
Add the following entries to `.gitignore`:

```gitignore
# Sentinel security audit logs (never commit before remediation)
.sentinel_logs/

# Agent session persistence (all common default paths)
.weave-sessions/
weave-sessions/
```

---

## Verification

Run `git status` after creating `.sentinel_logs/weave-trace.md`.
Assert that the file is listed as **untracked** (ignored), not staged.
