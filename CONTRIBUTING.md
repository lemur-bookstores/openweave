# 🤝 Contributing to OpenWeave

First off — thank you! OpenWeave is community-driven and every contribution matters,
whether it's a bug report, a new feature, documentation, or a typo fix.

---

## 🧵 OpenWeave Contribution Philosophy

Before contributing code, read the core principle:

> **Every line of code must have a traceable purpose.**  
> No orphan functions. No speculative abstractions. No code that "might be useful later."

This isn't just what the agent enforces — it's how we build OpenWeave itself.

---

## 📋 Before You Start

1. Check [existing issues](https://github.com/openweave/openweave/issues) to avoid duplicates
2. For large features, open a Discussion first to align with maintainers
3. For bugs, use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
4. For features, use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)

---

## 🛠️ Development Setup

```bash
# Prerequisites: Node.js 18+, Python 3.11+, pnpm 8+

git clone https://github.com/YOUR_FORK/openweave.git
cd openweave

# Install all workspace dependencies
pnpm install

# Run tests across all packages
pnpm test

# Run linting
pnpm lint

# Start dev mode (all packages in watch mode)
pnpm dev
```

### Package-specific development

```bash
# Work on a specific package
cd packages/weave-graph
pnpm dev

# Run only that package's tests
pnpm test
```

---

## 🌿 Branch Naming

```
feat/short-description       # New feature
fix/short-description        # Bug fix
docs/short-description       # Documentation only
refactor/short-description   # Code restructure, no behavior change
test/short-description       # Adding or fixing tests
chore/short-description      # Build, CI, tooling changes
```

---

## ✅ Pull Request Checklist

Before submitting a PR, verify:

- [ ] My code follows the project's style (`pnpm lint` passes)
- [ ] I've added/updated tests for my changes (`pnpm test` passes)
- [ ] I've run WeaveLint — no orphan code introduced
- [ ] I've updated relevant documentation
- [ ] My PR title is clear and follows the format: `type(scope): description`
- [ ] I've linked the related issue (`Closes #123`)

---

## 📐 Code Standards

### TypeScript / JavaScript
- Strict TypeScript (`strict: true`)
- ESLint + Prettier enforced (config in repo root)
- No `any` types without explicit justification in a comment

### Python
- Python 3.11+, typed with `mypy`
- `ruff` for linting and formatting
- Docstrings required on all public functions

### The Orphan Rule
Every function, class, and module you create must be:
1. **Called** from at least one other place in the system, OR
2. **Explicitly marked** as a public API entry point with a `# PUBLIC API` comment

If WeaveLint reports orphans in your PR, the CI will fail.

---

## 🏗️ Monorepo Structure

```
openweave/
├── apps/           # Runnable applications (agent, CLI, dashboard)
├── packages/       # Shared libraries published to npm
├── docs/           # Documentation source
└── scripts/        # Repo maintenance scripts
```

When adding a new package:
1. Create under `packages/` or `apps/`
2. Follow existing `package.json` structure
3. Add to the packages table in the root `README.md`
4. Add milestones to `ROADMAP.md`

---

## 💬 Community

- **Discord:** [discord.gg/openweave](https://discord.gg/openweave)
- **Discussions:** [GitHub Discussions](https://github.com/openweave/openweave/discussions)

We follow the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).  
Be kind. Be constructive. Build together.