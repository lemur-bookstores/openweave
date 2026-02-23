/**
 * Skill: container-advisor
 *
 * Audits Dockerfile(s) against a best-practice checklist and produces a
 * structured report with pass/fail per check plus remediation snippets.
 *
 * Checks:
 *   1. Multi-stage build   — at least 2 FROM instructions
 *   2. Non-root user       — USER instruction present (not root/0)
 *   3. HEALTHCHECK         — HEALTHCHECK instruction defined
 *   4. Pinned base image   — FROM uses a tag other than "latest" or no-tag
 *   5. Minimal COPY scope  — no bare `COPY . .` (copies entire context)
 *   6. No sudo usage       — RUN sudo ... is a smell
 *   7. No secrets in ENV   — ENV key=value with secret-like name
 *   8. Explicit WORKDIR    — WORKDIR instruction set before COPY/RUN
 *   9. No `apt-get upgrade` — unpinned system upgrade → non-reproducible
 *  10. Combined RUN layers  — multiple consecutive RUN instructions (layer bloat)
 *
 * Input options (ctx.graph):
 *   - `dockerfileContent` {string}   — inject Dockerfile text (tests)
 *   - `dockerfilePath`    {string}   — path relative to projectRoot
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface DockerCheck {
  id: string;
  title: string;
  status: CheckStatus;
  severity: 'error' | 'warning' | 'info';
  details: string;
  remediation: string;
}

export interface ContainerReport {
  dockerfilePath: string;
  checks: DockerCheck[];
  score: number;  // 0-100
  errors: number;
  warnings: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Individual check implementations
// ---------------------------------------------------------------------------

function checkMultiStage(lines: string[]): CheckStatus {
  const fromCount = lines.filter((l) => /^FROM\s+/i.test(l.trim())).length;
  return fromCount >= 2 ? 'pass' : 'fail';
}

function checkNonRootUser(lines: string[]): CheckStatus {
  const userLine = lines.find((l) => /^USER\s+/i.test(l.trim()));
  if (!userLine) return 'fail';
  const val = userLine.replace(/^USER\s+/i, '').trim().toLowerCase();
  if (val === 'root' || val === '0') return 'fail';
  return 'pass';
}

function checkHealthcheck(lines: string[]): CheckStatus {
  return lines.some((l) => /^HEALTHCHECK\s+/i.test(l.trim())) ? 'pass' : 'warn';
}

function checkPinnedBase(lines: string[]): CheckStatus {
  const froms = lines.filter((l) => /^FROM\s+/i.test(l.trim()));
  for (const from of froms) {
    const image = from.replace(/^FROM\s+/i, '').split(/\s+/)[0];
    if (image === 'scratch') continue;                   // scratch is fine
    if (!image.includes(':')) return 'fail';             // no tag at all
    if (image.endsWith(':latest')) return 'fail';        // latest is unpinned
  }
  return 'pass';
}

function checkCopyScope(lines: string[]): CheckStatus {
  // Bare "COPY . ." or "COPY . /" copies entire context
  return lines.some((l) => /^COPY\s+\.\s+[./]/i.test(l.trim())) ? 'warn' : 'pass';
}

function checkNoSudo(lines: string[]): CheckStatus {
  return lines.some((l) => /^RUN\b.+\bsudo\b/i.test(l.trim())) ? 'warn' : 'pass';
}

function checkNoSecretsInEnv(lines: string[]): CheckStatus {
  const SECRET_KEYS = /\b(password|passwd|secret|api_?key|token|private_?key|auth)\s*=/i;
  return lines.some((l) => /^ENV\s+/i.test(l.trim()) && SECRET_KEYS.test(l)) ? 'fail' : 'pass';
}

function checkWorkdir(lines: string[]): CheckStatus {
  const instrs = lines.map((l) => l.trim()).filter((l) => /^(COPY|RUN|WORKDIR)\s+/i.test(l));
  // WORKDIR should come before first COPY or RUN
  const firstCopyRun = instrs.findIndex((l) => /^(COPY|RUN)\s+/i.test(l));
  const firstWorkdir = instrs.findIndex((l) => /^WORKDIR\s+/i.test(l));
  if (firstWorkdir === -1) return 'fail';
  if (firstCopyRun === -1) return 'pass';
  return firstWorkdir < firstCopyRun ? 'pass' : 'warn';
}

function checkNoAptUpgrade(lines: string[]): CheckStatus {
  return lines.some((l) => /apt-get\s+upgrade\b/i.test(l)) ? 'warn' : 'pass';
}

function checkRunLayers(lines: string[]): CheckStatus {
  let consecutive = 0;
  let maxConsecutive = 0;
  for (const l of lines) {
    if (/^RUN\s+/i.test(l.trim())) {
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else if (l.trim().length > 0 && !l.trim().startsWith('#')) {
      consecutive = 0;
    }
  }
  return maxConsecutive >= 3 ? 'warn' : 'pass';
}

// ---------------------------------------------------------------------------
// Check registry
// ---------------------------------------------------------------------------

interface CheckDef {
  id: string;
  title: string;
  severity: DockerCheck['severity'];
  run: (lines: string[]) => CheckStatus;
  failDetails: string;
  warnDetails: string;
  remediation: string;
}

const CHECKS: CheckDef[] = [
  {
    id: 'multi-stage',
    title: 'Multi-stage build',
    severity: 'error',
    run: checkMultiStage,
    failDetails: 'Only one FROM instruction found — single-stage build ships build tools to production.',
    warnDetails: '',
    remediation: 'Split into builder and final stages:\n  FROM node:22-alpine AS builder\n  RUN npm ci && npm run build\n  FROM node:22-alpine\n  COPY --from=builder /app/dist ./dist',
  },
  {
    id: 'non-root-user',
    title: 'Non-root USER',
    severity: 'error',
    run: checkNonRootUser,
    failDetails: 'Container runs as root — a container escape would grant host root access.',
    warnDetails: '',
    remediation: 'Add before CMD/ENTRYPOINT:\n  RUN addgroup -S appgroup && adduser -S appuser -G appgroup\n  USER appuser',
  },
  {
    id: 'healthcheck',
    title: 'HEALTHCHECK defined',
    severity: 'warning',
    run: checkHealthcheck,
    failDetails: '',
    warnDetails: 'No HEALTHCHECK instruction — orchestrators (Docker Swarm, ECS) cannot detect unhealthy containers.',
    remediation: 'Add:\n  HEALTHCHECK --interval=30s --timeout=5s --retries=3 \\\n    CMD wget -qO- http://localhost:3000/health || exit 1',
  },
  {
    id: 'pinned-base',
    title: 'Pinned base image version',
    severity: 'error',
    run: checkPinnedBase,
    failDetails: 'Base image uses `:latest` or has no tag — builds are not reproducible.',
    warnDetails: '',
    remediation: 'Use a specific digest or version tag:\n  FROM node:22.12.0-alpine3.21',
  },
  {
    id: 'copy-scope',
    title: 'Scoped COPY (no `COPY . .`)',
    severity: 'warning',
    run: checkCopyScope,
    failDetails: '',
    warnDetails: '`COPY . .` copies the entire build context including secrets, .git, node_modules.',
    remediation: 'Use a .dockerignore and copy only what the image needs:\n  COPY package.json pnpm-lock.yaml ./\n  COPY src/ ./src/',
  },
  {
    id: 'no-sudo',
    title: 'No sudo in RUN',
    severity: 'warning',
    run: checkNoSudo,
    failDetails: '',
    warnDetails: '`sudo` in RUN layers is a smell — the build user should already have required permissions.',
    remediation: 'Grant permissions during image build or switch USER instead of using sudo at runtime.',
  },
  {
    id: 'no-secrets-env',
    title: 'No secrets in ENV',
    severity: 'error',
    run: checkNoSecretsInEnv,
    failDetails: 'Secret-like key found in ENV instruction — secrets baked into layers are extractable via `docker history`.',
    warnDetails: '',
    remediation: 'Pass secrets at runtime via environment variables or Docker secrets:\n  docker run -e API_KEY=$API_KEY myimage',
  },
  {
    id: 'explicit-workdir',
    title: 'WORKDIR set before COPY/RUN',
    severity: 'warning',
    run: checkWorkdir,
    failDetails: 'No WORKDIR set — files are placed in root (/) by default.',
    warnDetails: 'WORKDIR defined after COPY/RUN — early instructions run in an unexpected directory.',
    remediation: 'Set WORKDIR early:\n  WORKDIR /app',
  },
  {
    id: 'no-apt-upgrade',
    title: 'No `apt-get upgrade`',
    severity: 'warning',
    run: checkNoAptUpgrade,
    failDetails: '',
    warnDetails: '`apt-get upgrade` upgrades all packages to unspecified versions — breaks reproducibility.',
    remediation: 'Pin specific package versions or use a freshly pulled base image instead.',
  },
  {
    id: 'run-layers',
    title: 'Minimal RUN layers',
    severity: 'warning',
    run: checkRunLayers,
    failDetails: '',
    warnDetails: '3+ consecutive RUN instructions detected — each adds a layer that increases image size.',
    remediation: 'Chain RUN instructions with &&:\n  RUN npm ci \\\n   && npm run build \\\n   && rm -rf node_modules',
  },
];

// ---------------------------------------------------------------------------
// Main audit function
// ---------------------------------------------------------------------------

export function auditDockerfile(content: string, filePath = 'Dockerfile'): ContainerReport {
  const lines = content.split('\n');
  const checks: DockerCheck[] = [];

  for (const def of CHECKS) {
    const status = def.run(lines);
    let details = '';
    if (status === 'fail') details = def.failDetails;
    else if (status === 'warn') details = def.warnDetails;

    checks.push({
      id: def.id,
      title: def.title,
      status,
      severity: def.severity,
      details,
      remediation: status !== 'pass' ? def.remediation : '',
    });
  }

  const errors = checks.filter((c) => c.status === 'fail' && c.severity === 'error').length;
  const warnings = checks.filter((c) => (c.status === 'fail' || c.status === 'warn') && c.severity === 'warning').length;
  const passed = checks.filter((c) => c.status === 'pass').length;
  const score = Math.round((passed / checks.length) * 100);

  const summary = errors > 0
    ? `❌ ${errors} error(s), ${warnings} warning(s) — score: ${score}/100`
    : warnings > 0
    ? `⚠️  ${warnings} warning(s) — score: ${score}/100`
    : `✅ All checks passed — score: ${score}/100`;

  return { dockerfilePath: filePath, checks, score, errors, warnings, summary };
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const containerAdvisorSkill: SkillModule = {
  id: 'container-advisor',
  name: 'Container Advisor',
  description: 'Audits Dockerfiles against 10 best-practice checks (multi-stage, non-root, HEALTHCHECK, pinned base, etc.)',
  version: '1.0.0',
  enabled: false,
  tags: ['devops', 'docker'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    let content = '';
    let filePath = 'Dockerfile';

    if (typeof opts['dockerfileContent'] === 'string') {
      content = opts['dockerfileContent'];
    } else {
      const rel = typeof opts['dockerfilePath'] === 'string' ? opts['dockerfilePath'] : 'Dockerfile';
      filePath = join(ctx.projectRoot, rel);
      if (!existsSync(filePath)) {
        return {
          success: false,
          output: `❌ Dockerfile not found at ${filePath}`,
          error: 'dockerfile not found',
        };
      }
      content = readFileSync(filePath, 'utf-8');
    }

    const report = auditDockerfile(content, filePath);

    const lines = [
      `🐳 Container Advisor — ${report.dockerfilePath}`,
      `   ${report.summary}`,
      '',
    ];

    for (const c of report.checks) {
      const icon = c.status === 'pass' ? '✅' : c.status === 'fail' ? '❌' : '⚠️ ';
      lines.push(`  ${icon} ${c.title}`);
      if (c.details) lines.push(`     ${c.details}`);
      if (c.remediation) {
        lines.push(`     💡 Remediation:`);
        for (const rl of c.remediation.split('\n')) lines.push(`        ${rl}`);
      }
    }

    return {
      success: report.errors === 0,
      output: lines.join('\n'),
      data: report,
    };
  },
};
