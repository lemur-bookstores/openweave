# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 · Builder
# Install dependencies, build weave-graph + weave-link, then
# deploy a self-contained production tree via `pnpm deploy`.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm via Corepack (bundled with Node ≥ 16.13)
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

WORKDIR /workspace

# ── Layer: workspace manifests (cached unless lock file changes) ──────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy only the package.json files & tsconfigs first so pnpm install is cached
COPY packages/weave-graph/package.json    packages/weave-graph/package.json
COPY packages/weave-graph/tsconfig.json   packages/weave-graph/tsconfig.json
COPY packages/weave-link/package.json     packages/weave-link/package.json
COPY packages/weave-link/tsconfig.json    packages/weave-link/tsconfig.json

# ── Install all workspace dependencies ───────────────────────────────────────
RUN pnpm install --frozen-lockfile

# ── Layer: source code ────────────────────────────────────────────────────────
COPY packages/weave-graph/src packages/weave-graph/src
COPY packages/weave-link/src   packages/weave-link/src

# ── Build (dependency first, then consumer) ───────────────────────────────────
RUN pnpm --filter @openweave/weave-graph build
RUN pnpm --filter @openweave/weave-link  build

# ── Create a flat, self-contained production deploy ───────────────────────────
# pnpm deploy resolves workspace:* refs by inlining the built package files.
RUN pnpm deploy --filter @openweave/weave-link --prod /app/deploy

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 · Production
# Minimal runtime image — only the deployed artefact is copied.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Non-root user for security
RUN addgroup -S weave && adduser -S weave -G weave

WORKDIR /app

# Copy the flattened deploy (dist/ + node_modules/ + package.json)
COPY --from=builder --chown=weave:weave /app/deploy .

USER weave

# ── Runtime configuration (override with -e / docker-compose env) ─────────────
ENV NODE_ENV=production
ENV WEAVE_PORT=3001
ENV WEAVE_HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${WEAVE_PORT}/health || exit 1

# Start the HTTP server, picking up WEAVE_API_KEY from the environment
CMD ["node", "dist/cli.js", "start", \
     "--host", "0.0.0.0", \
     "--port", "3001", \
     "--verbose"]
