import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// pipeline-aware
// ──────────────────────────────────────────────────────────────────────────
import { detectPlatform, parsePipelineLog, pipelineAwareSkill } from './pipeline-aware.js';
import type { PipelineReport } from './pipeline-aware.js';

describe('pipeline-aware — detectPlatform', () => {
  it('detects GitHub Actions from ##[error] marker', () => {
    expect(detectPlatform('##[error]Something failed')).toBe('github');
  });

  it('detects GitHub Actions from ::error:: annotation', () => {
    expect(detectPlatform('::error file=src/foo.ts::Bad type')).toBe('github');
  });

  it('detects GitLab from CI_JOB_ID', () => {
    expect(detectPlatform('CI_JOB_ID=123 GITLAB_CI=true')).toBe('gitlab');
  });

  it('falls back to generic', () => {
    expect(detectPlatform('Some random build output')).toBe('generic');
  });
});

describe('pipeline-aware — parsePipelineLog', () => {
  it('reports passed status when no failure patterns found', () => {
    const report = parsePipelineLog('Build started\nBuild finished\n');
    expect(report.status).toBe('passed');
    expect(report.failures).toHaveLength(0);
  });

  it('detects ##[error] GitHub Actions failure', () => {
    const log = '##[error]Process fail on step Build\n';
    const report = parsePipelineLog(log);
    expect(report.status).toBe('failed');
    expect(report.failures.some((f) => f.category === 'build-error')).toBe(true);
  });

  it('detects TypeScript TS error', () => {
    const log = "src/index.ts(10,5): error TS2345: Argument of type 'string' is not assignable.\n";
    const report = parsePipelineLog(log);
    expect(report.failures.some((f) => f.category === 'build-error' && f.step === 'TS2345')).toBe(true);
  });

  it('detects test failures (FAIL pattern)', () => {
    const log = 'FAIL  src/utils.test.ts\n  ● test description\n';
    const report = parsePipelineLog(log);
    expect(report.failures.some((f) => f.category === 'test-failure')).toBe(true);
  });

  it('detects network error', () => {
    const log = 'npm ERR! network ECONNREFUSED\n';
    const report = parsePipelineLog(log);
    expect(report.failures.some((f) => f.category === 'network-error')).toBe(true);
  });

  it('includes surrounding context in failure', () => {
    const log = 'line before\n##[error]actual error\nline after\n';
    const report = parsePipelineLog(log);
    expect(report.failures[0].context).toContain('line before');
  });
});

describe('pipeline-aware — skill execute', () => {
  it('returns success: true for clean log', async () => {
    const ctx = { projectRoot: '/tmp', files: [], graph: { log: 'Build OK\n' }, session: null, git: null };
    const result = await pipelineAwareSkill.execute(ctx);
    expect(result.success).toBe(true);
  });

  it('returns success: false when failures detected', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { log: '##[error]Critical step failed\n' },
      session: null,
      git: null,
    };
    const result = await pipelineAwareSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect((result.data as PipelineReport).failures.length).toBeGreaterThan(0);
  });

  it('returns error when no log provided', async () => {
    const ctx = { projectRoot: '/tmp', files: [], graph: {}, session: null, git: null };
    const result = await pipelineAwareSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no log input/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// dep-audit
// ──────────────────────────────────────────────────────────────────────────
import { parseMajor, parseNpmAudit, depAuditSkill } from './dep-audit.js';
import type { DepAuditResult } from './dep-audit.js';

describe('dep-audit — parseMajor', () => {
  it('parses ^18.0.0 as 18', () => expect(parseMajor('^18.0.0')).toBe(18));
  it('parses ~4.1.2 as 4', () => expect(parseMajor('~4.1.2')).toBe(4));
  it('parses exact 1.2.3 as 1', () => expect(parseMajor('1.2.3')).toBe(1));
  it('returns -1 for workspace:*', () => expect(parseMajor('workspace:*')).toBe(-1));
});

describe('dep-audit — parseNpmAudit (v7 format)', () => {
  const fakeAudit = JSON.stringify({
    vulnerabilities: {
      'lodash': {
        fixAvailable: { version: '4.17.21' },
        via: [{ severity: 'high', title: 'Prototype Pollution', url: 'https://npmjs.com/advisories/1523' }],
      },
      'express': {
        fixAvailable: false,
        via: [{ severity: 'critical', title: 'Open Redirect', url: 'https://npmjs.com/advisories/8573' }],
      },
    },
  });

  it('parses lodash advisory', () => {
    const advisories = parseNpmAudit(fakeAudit);
    expect(advisories.some((a) => a.pkg === 'lodash' && a.severity === 'high')).toBe(true);
  });

  it('parses critical express advisory', () => {
    const advisories = parseNpmAudit(fakeAudit);
    expect(advisories.some((a) => a.pkg === 'express' && a.severity === 'critical')).toBe(true);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseNpmAudit('not json')).toHaveLength(0);
  });
});

describe('dep-audit — skill execute (injected packages)', () => {
  it('returns success when no critical advisories (skipAudit)', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: {
        skipAudit: true,
        packages: [{ source: 'root/package.json', dependencies: { lodash: '^4.17.21' } }],
      },
      session: null,
      git: null,
    };
    const result = await depAuditSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as DepAuditResult;
    expect(data.totalDeps).toBe(1);
    expect(data.scannedFiles).toContain('root/package.json');
  });

  it('flags injected critical advisory', async () => {
    const fakeAudit = JSON.stringify({
      vulnerabilities: {
        axios: {
          fixAvailable: false,
          via: [{ severity: 'critical', title: 'SSRF', url: 'https://example.com/1' }],
        },
      },
    });
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { skipAudit: true, auditJson: fakeAudit, packages: [] },
      session: null,
      git: null,
    };
    const result = await depAuditSkill.execute(ctx);
    expect(result.success).toBe(false);
    const data = result.data as DepAuditResult;
    expect(data.criticalCount).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// perf-profile
// ──────────────────────────────────────────────────────────────────────────
import { extractTimingsFromLog, analyseTimings, perfProfileSkill } from './perf-profile.js';
import type { PerfReport } from './perf-profile.js';

describe('perf-profile — extractTimingsFromLog', () => {
  it('extracts vitest Duration line', () => {
    const entries = extractTimingsFromLog('Duration  15.3 s\n');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].durationMs).toBeGreaterThan(0);
    expect(entries[0].category).toBe('test');
  });

  it('extracts npm install duration', () => {
    const entries = extractTimingsFromLog('added 243 packages in 8s\n');
    expect(entries.some((e) => e.category === 'install')).toBe(true);
  });

  it('returns empty array for no timing data', () => {
    expect(extractTimingsFromLog('nothing here\n')).toHaveLength(0);
  });
});

describe('perf-profile — analyseTimings', () => {
  it('reports no bottlenecks below threshold', () => {
    const report = analyseTimings([{ label: 'build', durationMs: 2000, category: 'build' }], 10_000);
    expect(report.bottlenecks.filter((b) => b.severity === 'critical')).toHaveLength(0);
  });

  it('flags critical bottleneck above threshold', () => {
    const report = analyseTimings([{ label: 'slow test', durationMs: 60_000, category: 'test' }], 10_000);
    expect(report.bottlenecks.some((b) => b.severity === 'critical')).toBe(true);
  });

  it('identifies slowest step', () => {
    const entries = [
      { label: 'fast', durationMs: 1000, category: 'build' as const },
      { label: 'slow', durationMs: 30_000, category: 'test' as const },
    ];
    const report = analyseTimings(entries);
    expect(report.slowestStep?.label).toBe('slow');
  });

  it('returns empty report for no entries', () => {
    const report = analyseTimings([]);
    expect(report.slowestStep).toBeNull();
    expect(report.bottlenecks).toHaveLength(0);
  });
});

describe('perf-profile — skill execute (injected timings)', () => {
  it('returns success when no critical bottlenecks', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { timings: [{ label: 'build', durationMs: 3000, category: 'build' }] },
      session: null,
      git: null,
    };
    const result = await perfProfileSkill.execute(ctx);
    expect(result.success).toBe(true);
  });

  it('returns success: false on critical bottleneck', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: {
        threshold: 5000,
        timings: [{ label: 'huge test', durationMs: 120_000, category: 'test' }],
      },
      session: null,
      git: null,
    };
    const result = await perfProfileSkill.execute(ctx);
    expect(result.success).toBe(false);
    const data = result.data as PerfReport;
    expect(data.bottlenecks.some((b) => b.severity === 'critical')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// container-advisor
// ──────────────────────────────────────────────────────────────────────────
import { auditDockerfile, containerAdvisorSkill } from './container-advisor.js';
import type { ContainerReport } from './container-advisor.js';

const GOOD_DOCKERFILE = `
FROM node:22.12.0-alpine3.21 AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:22.12.0-alpine3.21
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
`.trim();

const BAD_DOCKERFILE = `
FROM node:latest
COPY . .
RUN npm install
ENV API_KEY=supersecret123
CMD ["node", "index.js"]
`.trim();

describe('container-advisor — auditDockerfile (good)', () => {
  it('passes multi-stage check', () => {
    const report = auditDockerfile(GOOD_DOCKERFILE);
    const c = report.checks.find((c) => c.id === 'multi-stage')!;
    expect(c.status).toBe('pass');
  });

  it('passes non-root user check', () => {
    const report = auditDockerfile(GOOD_DOCKERFILE);
    const c = report.checks.find((c) => c.id === 'non-root-user')!;
    expect(c.status).toBe('pass');
  });

  it('passes healthcheck check', () => {
    const report = auditDockerfile(GOOD_DOCKERFILE);
    const c = report.checks.find((c) => c.id === 'healthcheck')!;
    expect(c.status).toBe('pass');
  });

  it('passes pinned base check', () => {
    const report = auditDockerfile(GOOD_DOCKERFILE);
    const c = report.checks.find((c) => c.id === 'pinned-base')!;
    expect(c.status).toBe('pass');
  });

  it('has 0 errors', () => {
    expect(auditDockerfile(GOOD_DOCKERFILE).errors).toBe(0);
  });
});

describe('container-advisor — auditDockerfile (bad)', () => {
  it('fails multi-stage check', () => {
    const c = auditDockerfile(BAD_DOCKERFILE).checks.find((c) => c.id === 'multi-stage')!;
    expect(c.status).toBe('fail');
  });

  it('fails pinned-base check for :latest', () => {
    const c = auditDockerfile(BAD_DOCKERFILE).checks.find((c) => c.id === 'pinned-base')!;
    expect(c.status).toBe('fail');
  });

  it('fails no-secrets-env check', () => {
    const c = auditDockerfile(BAD_DOCKERFILE).checks.find((c) => c.id === 'no-secrets-env')!;
    expect(c.status).toBe('fail');
  });

  it('warns on copy-scope', () => {
    const c = auditDockerfile(BAD_DOCKERFILE).checks.find((c) => c.id === 'copy-scope')!;
    expect(c.status).toBe('warn');
  });

  it('score is lower for bad Dockerfile', () => {
    expect(auditDockerfile(BAD_DOCKERFILE).score).toBeLessThan(auditDockerfile(GOOD_DOCKERFILE).score);
  });
});

describe('container-advisor — skill execute (injected content)', () => {
  it('returns success for good Dockerfile', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { dockerfileContent: GOOD_DOCKERFILE },
      session: null,
      git: null,
    };
    const result = await containerAdvisorSkill.execute(ctx);
    expect(result.success).toBe(true);
  });

  it('returns success: false for bad Dockerfile', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { dockerfileContent: BAD_DOCKERFILE },
      session: null,
      git: null,
    };
    const result = await containerAdvisorSkill.execute(ctx);
    expect(result.success).toBe(false);
    const data = result.data as ContainerReport;
    expect(data.errors).toBeGreaterThan(0);
  });

  it('returns error when no Dockerfile found', async () => {
    const ctx = {
      projectRoot: '/nonexistent/path',
      files: [],
      graph: { dockerfilePath: 'Dockerfile' },
      session: null,
      git: null,
    };
    const result = await containerAdvisorSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/dockerfile not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// deploy-provision
// ──────────────────────────────────────────────────────────────────────────
import { deployProvisionSkill } from './deploy-provision.js';
import type { ProvisionReport } from './deploy-provision.js';

describe('deploy-provision — skill execute (validate mode, dry-run)', () => {
  const baseCtx = (envOverrides?: Record<string, string>) => ({
    projectRoot: '/tmp',
    files: [],
    graph: {
      mode: 'validate',
      dryRun: true,
      domain: 'example.com',
      env: { WEAVE_API_KEY: 'strongkey123', DOMAIN: 'example.com', ...envOverrides },
    },
    session: null,
    git: null,
  });

  it('reports ready when all env vars set in dry-run', async () => {
    const result = await deployProvisionSkill.execute(baseCtx());
    const data = result.data as ProvisionReport;
    // In dry-run the only real checks are env vars
    const envChecks = data.prereqs.filter((p) => p.id.startsWith('env-'));
    expect(envChecks.every((p) => p.status === 'ok')).toBe(true);
  });

  it('fails prereq when WEAVE_API_KEY missing', async () => {
    const result = await deployProvisionSkill.execute(baseCtx({ WEAVE_API_KEY: '' }));
    const data = result.data as ProvisionReport;
    const apiKeyCheck = data.prereqs.find((p) => p.id === 'env-WEAVE_API_KEY')!;
    expect(apiKeyCheck.status).toBe('fail');
  });

  it('warns when WEAVE_API_KEY is too short', async () => {
    const result = await deployProvisionSkill.execute(baseCtx({ WEAVE_API_KEY: 'short' }));
    const data = result.data as ProvisionReport;
    const apiKeyCheck = data.prereqs.find((p) => p.id === 'env-WEAVE_API_KEY')!;
    expect(apiKeyCheck.status).toBe('warn');
  });

  it('does not run provision steps in validate mode', async () => {
    const result = await deployProvisionSkill.execute(baseCtx());
    const data = result.data as ProvisionReport;
    expect(data.steps).toHaveLength(0);
  });

  it('returns error when provision mode without confirmRun', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { mode: 'provision', dryRun: true, confirmRun: false, env: {} },
      session: null,
      git: null,
    };
    const result = await deployProvisionSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/confirmRun/);
  });

  it('runs provision steps in dry-run provision mode with confirmRun', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: {
        mode: 'provision',
        dryRun: true,
        confirmRun: true,
        env: { WEAVE_API_KEY: 'strongkey123', DOMAIN: 'example.com' },
      },
      session: null,
      git: null,
    };
    const result = await deployProvisionSkill.execute(ctx);
    const data = result.data as ProvisionReport;
    // All steps should be 'done' in dry-run mode (simulated)
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.steps.every((s) => s.status === 'done' || s.status === 'skipped')).toBe(true);
  });
});
