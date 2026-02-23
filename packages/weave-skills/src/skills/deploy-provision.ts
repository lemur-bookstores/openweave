/**
 * Skill: deploy-provision
 *
 * Interactive production provisioning guide. Validates prerequisites
 * (DNS resolution, open ports, Docker availability, required env vars)
 * and optionally invokes `scripts/deploy/setup.sh` step by step.
 *
 * Integrates with M23 — the deploy scripts live in `scripts/deploy/`.
 *
 * Modes (ctx.graph['mode']):
 *   - 'validate'  — check prerequisites only (default, safe)
 *   - 'provision' — run setup.sh steps (requires confirmRun: true)
 *
 * Input options (ctx.graph):
 *   - `domain`      {string}   — FQDN to check DNS for
 *   - `apiKey`      {string}   — WEAVE_API_KEY value to validate
 *   - `ports`       {number[]} — ports to check (default: [80, 443, 3001])
 *   - `dryRun`      {boolean}  — simulate without executing shell commands
 *   - `confirmRun`  {boolean}  — must be true to allow mode='provision'
 *   - `env`         {Record<string,string>} — inject env for testing
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrereqStatus = 'ok' | 'fail' | 'warn' | 'skip';

export interface PrereqCheck {
  id: string;
  name: string;
  status: PrereqStatus;
  message: string;
  fix?: string;
}

export interface ProvisionStep {
  id: string;
  name: string;
  script: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  output?: string;
  error?: string;
}

export interface ProvisionReport {
  domain: string;
  prereqs: PrereqCheck[];
  steps: ProvisionStep[];
  ready: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// Prerequisite validators
// ---------------------------------------------------------------------------

function checkDocker(dryRun: boolean): PrereqCheck {
  if (dryRun) return { id: 'docker', name: 'Docker available', status: 'skip', message: 'dry-run' };
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return { id: 'docker', name: 'Docker available', status: 'ok', message: 'Docker is installed' };
  } catch {
    return {
      id: 'docker',
      name: 'Docker available',
      status: 'fail',
      message: 'Docker not found in PATH',
      fix: 'Install Docker Engine: https://docs.docker.com/engine/install/',
    };
  }
}

function checkDns(domain: string, dryRun: boolean): PrereqCheck {
  if (!domain) {
    return { id: 'dns', name: 'DNS resolution', status: 'warn', message: 'No domain provided — skipping DNS check' };
  }
  if (dryRun) {
    return { id: 'dns', name: 'DNS resolution', status: 'skip', message: `dry-run (would resolve ${domain})` };
  }
  try {
    execSync(`nslookup ${domain}`, { stdio: 'pipe' });
    return { id: 'dns', name: 'DNS resolution', status: 'ok', message: `${domain} resolves` };
  } catch {
    try {
      execSync(`ping -c 1 ${domain}`, { stdio: 'pipe' });
      return { id: 'dns', name: 'DNS resolution', status: 'ok', message: `${domain} reachable` };
    } catch {
      return {
        id: 'dns',
        name: 'DNS resolution',
        status: 'fail',
        message: `Cannot resolve ${domain}`,
        fix: `Ensure an A record for ${domain} points to this server's public IP`,
      };
    }
  }
}

function checkPorts(ports: number[], dryRun: boolean): PrereqCheck[] {
  if (dryRun) {
    return ports.map((p) => ({
      id: `port-${p}`,
      name: `Port ${p} reachable`,
      status: 'skip' as PrereqStatus,
      message: 'dry-run',
    }));
  }
  return ports.map((p) => {
    try {
      // Check if port is already in use (potential conflict)
      execSync(`lsof -i :${p} -sTCP:LISTEN`, { stdio: 'pipe' });
      return {
        id: `port-${p}`,
        name: `Port ${p} available`,
        status: 'warn' as PrereqStatus,
        message: `Port ${p} is already in use — may conflict with new service`,
        fix: `Stop the existing process on port ${p} before provisioning`,
      };
    } catch {
      // lsof returns non-zero when nothing is listening — that means the port is free
      return {
        id: `port-${p}`,
        name: `Port ${p} available`,
        status: 'ok' as PrereqStatus,
        message: `Port ${p} is free`,
      };
    }
  });
}

function checkEnvVars(
  required: string[],
  env: Record<string, string | undefined>,
): PrereqCheck[] {
  return required.map((key) => {
    const val = env[key];
    if (!val) {
      return {
        id: `env-${key}`,
        name: `Env: ${key}`,
        status: 'fail' as PrereqStatus,
        message: `${key} is not set`,
        fix: `export ${key}=<value>`,
      };
    }
    if (val.length < 8 && key.toLowerCase().includes('key')) {
      return {
        id: `env-${key}`,
        name: `Env: ${key}`,
        status: 'warn' as PrereqStatus,
        message: `${key} looks too short — use a strong random value`,
        fix: `weave-link keygen`,
      };
    }
    return {
      id: `env-${key}`,
      name: `Env: ${key}`,
      status: 'ok' as PrereqStatus,
      message: `${key} is set`,
    };
  });
}

function checkDeployScripts(projectRoot: string): PrereqCheck {
  const setupPath = join(projectRoot, 'scripts', 'deploy', 'setup.sh');
  if (existsSync(setupPath)) {
    return { id: 'scripts', name: 'Deploy scripts present', status: 'ok', message: setupPath };
  }
  return {
    id: 'scripts',
    name: 'Deploy scripts present',
    status: 'warn',
    message: 'scripts/deploy/setup.sh not found — M23 scripts not yet implemented',
    fix: 'Implement M23 deploy scripts or set mode=validate to skip provisioning',
  };
}

// ---------------------------------------------------------------------------
// Provision steps (M23 integration)
// ---------------------------------------------------------------------------

const PROVISION_STEPS: Omit<ProvisionStep, 'status' | 'output' | 'error'>[] = [
  { id: 'validate-env',    name: 'Validate environment variables', script: 'scripts/deploy/validate-env.sh' },
  { id: 'install-docker',  name: 'Ensure Docker is installed',     script: 'scripts/deploy/docker.sh' },
  { id: 'setup-firewall',  name: 'Configure firewall (ufw)',        script: 'scripts/deploy/firewall.sh' },
  { id: 'start-compose',   name: 'Start weave-link container',      script: 'scripts/deploy/compose.yml' },
  { id: 'setup-nginx',     name: 'Configure nginx reverse proxy',   script: 'scripts/deploy/nginx.sh' },
  { id: 'setup-tls',       name: 'Obtain TLS certificate (Let\'s Encrypt)', script: 'scripts/deploy/certbot.sh' },
  { id: 'verify',          name: 'Smoke-test HTTPS endpoint',       script: 'scripts/deploy/verify.sh' },
];

function runProvisionStep(
  step: Omit<ProvisionStep, 'status' | 'output' | 'error'>,
  projectRoot: string,
  dryRun: boolean,
): ProvisionStep {
  if (dryRun) {
    return { ...step, status: 'done', output: `[dry-run] would execute ${step.script}` };
  }

  const absScript = join(projectRoot, step.script);
  if (!existsSync(absScript)) {
    return { ...step, status: 'skipped', output: `Script not found: ${step.script}` };
  }

  try {
    const output = execSync(`bash "${absScript}"`, {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120_000,
    });
    return { ...step, status: 'done', output: output.slice(0, 500) };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    return { ...step, status: 'failed', error: String(e.stderr ?? e.message ?? 'unknown error').slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const deployProvisionSkill: SkillModule = {
  id: 'deploy-provision',
  name: 'Deploy & Provision',
  description: 'Validates production prerequisites (DNS, Docker, ports, env vars) and optionally runs scripts/deploy/setup.sh',
  version: '1.0.0',
  enabled: false,
  tags: ['devops', 'deploy'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    const mode = String(opts['mode'] ?? 'validate');
    const domain = String(opts['domain'] ?? '');
    const dryRun = Boolean(opts['dryRun'] ?? true);
    const confirmRun = Boolean(opts['confirmRun'] ?? false);
    const ports = Array.isArray(opts['ports'])
      ? (opts['ports'] as number[])
      : [80, 443, 3001];
    const injectedEnv = (opts['env'] as Record<string, string> | undefined) ?? process.env as Record<string, string | undefined>;

    // -- Prerequisite validation --
    const prereqs: PrereqCheck[] = [
      checkDocker(dryRun),
      checkDns(domain, dryRun),
      ...checkPorts(ports, dryRun),
      ...checkEnvVars(['WEAVE_API_KEY', 'DOMAIN'], injectedEnv as Record<string, string | undefined>),
      checkDeployScripts(ctx.projectRoot),
    ];

    const failedPrereqs = prereqs.filter((p) => p.status === 'fail');
    const warnPrereqs = prereqs.filter((p) => p.status === 'warn');

    // -- Provision steps --
    let steps: ProvisionStep[] = [];
    if (mode === 'provision') {
      if (!confirmRun) {
        return {
          success: false,
          output: '❌ Provision mode requires `confirmRun: true` in ctx.graph to prevent accidental execution.',
          error: 'confirmRun not set',
        };
      }
      if (failedPrereqs.length > 0 && !dryRun) {
        return {
          success: false,
          output: `❌ ${failedPrereqs.length} prerequisite(s) failed — fix them before provisioning.`,
          error: 'prerequisites failed',
        };
      }
      for (const stepDef of PROVISION_STEPS) {
        const result = runProvisionStep(stepDef, ctx.projectRoot, dryRun);
        steps.push(result);
        if (result.status === 'failed') break; // stop on first failure
      }
    }

    const ready = failedPrereqs.length === 0;
    const summary = ready
      ? `✅ All prerequisites passed${mode === 'provision' ? ' · provisioning complete' : ''}`
      : `❌ ${failedPrereqs.length} prerequisite(s) failed · ${warnPrereqs.length} warning(s)`;

    const report: ProvisionReport = { domain, prereqs, steps, ready, summary };

    // -- Format output --
    const lines = [
      `🚀 Deploy Provision (mode: ${mode}${dryRun ? ' · dry-run' : ''})`,
      `   ${summary}`,
      '',
      '  PREREQUISITES:',
    ];

    for (const p of prereqs) {
      const icon = p.status === 'ok' ? '✅' : p.status === 'fail' ? '❌' : p.status === 'warn' ? '⚠️ ' : '⏭ ';
      lines.push(`  ${icon} ${p.name}: ${p.message}`);
      if (p.fix) lines.push(`     💡 ${p.fix}`);
    }

    if (steps.length > 0) {
      lines.push('', '  PROVISION STEPS:');
      for (const s of steps) {
        const icon = s.status === 'done' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'skipped' ? '⏭ ' : '⏳';
        lines.push(`  ${icon} ${s.name}`);
        if (s.output) lines.push(`     ${s.output.split('\n')[0]}`);
        if (s.error) lines.push(`     ⚠️  ${s.error.split('\n')[0]}`);
      }
    }

    return {
      success: ready,
      output: lines.join('\n'),
      data: report,
    };
  },
};
