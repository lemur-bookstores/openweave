/**
 * Skill: pipeline-aware
 *
 * Parses CI/CD log output (GitHub Actions, GitLab CI, generic) and produces a
 * structured diagnosis: root cause, failing step, and a suggested remediation.
 *
 * Input options (ctx.graph):
 *   - `log`      {string}  — inject raw log content directly (for tests / piping)
 *   - `logFile`  {string}  — absolute path to a log file to read
 *   - `platform` {'github'|'gitlab'|'auto'} — hint for parser (default: 'auto')
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CIPlatform = 'github' | 'gitlab' | 'generic';

export type FailureCategory =
  | 'test-failure'
  | 'build-error'
  | 'lint-error'
  | 'permission-error'
  | 'network-error'
  | 'config-error'
  | 'timeout'
  | 'unknown';

export interface CIFailure {
  step: string;
  category: FailureCategory;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  context: string;   // surrounding log lines
  suggestion: string;
}

export interface PipelineReport {
  platform: CIPlatform;
  status: 'passed' | 'failed' | 'unknown';
  failures: CIFailure[];
  totalLines: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function detectPlatform(log: string): CIPlatform {
  if (/##\[group\]|##\[error\]|##\[warning\]|::(?:error|warning|notice|debug)(?:::|[ ,])/i.test(log)) return 'github';
  if (/Running with gitlab-runner|CI_JOB_ID|GITLAB_CI/i.test(log)) return 'gitlab';
  return 'generic';
}

// ---------------------------------------------------------------------------
// Failure pattern rules
// ---------------------------------------------------------------------------

interface FailurePattern {
  pattern: RegExp;
  category: FailureCategory;
  severity: CIFailure['severity'];
  step: (match: RegExpExecArray, line: string) => string;
  suggestion: string;
}

const PATTERNS: FailurePattern[] = [
  // GitHub Actions step failure
  {
    pattern: /##\[error\](.+)/i,
    category: 'build-error',
    severity: 'critical',
    step: (_m, line) => line,
    suggestion: 'Check the full Actions log for the step that emitted ##[error]. Expand collapsed groups.',
  },
  {
    pattern: /::error (?:file=([^,]+),)?[^:]*::(.+)/i,
    category: 'build-error',
    severity: 'critical',
    step: (m) => m[1] ?? 'unknown file',
    suggestion: 'Fix the reported error in the specified file and re-run the workflow.',
  },
  // Test failures
  {
    pattern: /\b(\d+)\s+(?:test(?:s)?|spec(?:s)?)\s+failed\b/i,
    category: 'test-failure',
    severity: 'critical',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Run the test suite locally with the same Node/Python version to reproduce and fix failures.',
  },
  {
    pattern: /FAIL\s+([\w/.-]+\.(?:test|spec)\.[jt]sx?)/i,
    category: 'test-failure',
    severity: 'critical',
    step: (m) => m[1],
    suggestion: `Run \`npx vitest run ${'{file}'}\` locally to reproduce the test failure.`,
  },
  {
    pattern: /AssertionError|expect\(.+\)\.to(?:Be|Equal|Throw)|FAILED|✕/,
    category: 'test-failure',
    severity: 'high',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Inspect the failed assertion — check mocks, fixtures and async handling.',
  },
  // TypeScript / build errors
  {
    pattern: /error TS(\d+):\s*(.+)/i,
    category: 'build-error',
    severity: 'critical',
    step: (m) => `TS${m[1]}`,
    suggestion: 'Fix the TypeScript compilation error. Run `tsc --noEmit` locally for the full list.',
  },
  {
    pattern: /Cannot find module '([^']+)'/i,
    category: 'build-error',
    severity: 'critical',
    step: (m) => m[1],
    suggestion: 'Run `pnpm install` or add the missing package to package.json dependencies.',
  },
  // Lint errors
  {
    pattern: /ESLint: (\d+) error/i,
    category: 'lint-error',
    severity: 'high',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Run `pnpm lint --fix` locally to auto-fix lint errors before pushing.',
  },
  // Permission / auth errors
  {
    pattern: /permission denied|EACCES|403 Forbidden|401 Unauthorized/i,
    category: 'permission-error',
    severity: 'critical',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Check repository secrets and Action permissions (Settings → Actions → Workflow permissions).',
  },
  // Network errors
  {
    pattern: /ECONNREFUSED|ETIMEDOUT|getaddrinfo ENOTFOUND|npm ERR! network/i,
    category: 'network-error',
    severity: 'high',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Transient network failure — retry the job. If persistent, check npm registry or VPN settings.',
  },
  // Timeout
  {
    pattern: /exceeded the timeout|timed out after|##\[warning\]Approaching timeout/i,
    category: 'timeout',
    severity: 'high',
    step: (_m, line) => line.trim().slice(0, 60),
    suggestion: 'Increase `timeout-minutes` in the job definition or optimise the slow step.',
  },
  // Exit code
  {
    pattern: /Process completed with exit code (\d+)/i,
    category: 'unknown',
    severity: 'critical',
    step: (m) => `exit code ${m[1]}`,
    suggestion: 'Non-zero exit code from process. Scroll up in the log to find the originating error.',
  },
  // GitLab-style
  {
    pattern: /ERROR:\s+(.+)/,
    category: 'build-error',
    severity: 'high',
    step: (m) => m[1].slice(0, 60),
    suggestion: 'Investigate the ERROR line above for the root cause.',
  },
  {
    pattern: /Job failed: (.+)/i,
    category: 'unknown',
    severity: 'critical',
    step: (m) => m[1].slice(0, 60),
    suggestion: 'Check the GitLab job trace for the step that triggered the failure.',
  },
];

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parsePipelineLog(log: string, platform?: CIPlatform): PipelineReport {
  const lines = log.split('\n');
  const resolvedPlatform = platform ?? detectPlatform(log);
  const failures: CIFailure[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of PATTERNS) {
      const m = rule.pattern.exec(line);
      if (!m) continue;

      // Gather surrounding context (up to 3 lines before/after)
      const ctxStart = Math.max(0, i - 2);
      const ctxEnd = Math.min(lines.length - 1, i + 2);
      const context = lines.slice(ctxStart, ctxEnd + 1).join('\n');

      const suggestion = rule.suggestion.replace('{file}', m[1] ?? 'file');
      failures.push({
        step: rule.step(m, line),
        category: rule.category,
        severity: rule.severity,
        message: line.trim().slice(0, 120),
        context,
        suggestion,
      });
      break; // one rule match per line
    }
  }

  const status: PipelineReport['status'] =
    failures.length === 0 ? 'passed' : 'failed';

  const criticals = failures.filter((f) => f.severity === 'critical').length;
  const highs = failures.filter((f) => f.severity === 'high').length;
  const summary =
    status === 'passed'
      ? '✅ No failure patterns detected'
      : `❌ ${criticals} critical, ${highs} high-severity failure(s) detected`;

  return { platform: resolvedPlatform, status, failures, totalLines: lines.length, summary };
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const pipelineAwareSkill: SkillModule = {
  id: 'pipeline-aware',
  name: 'Pipeline Aware',
  description: 'Parses CI/CD logs (GitHub Actions, GitLab) and produces structured failure diagnosis with root-cause suggestions',
  version: '1.0.0',
  enabled: false,
  tags: ['devops', 'ci'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    let log = '';

    if (typeof opts['log'] === 'string') {
      log = opts['log'];
    } else if (typeof opts['logFile'] === 'string') {
      const absPath = opts['logFile'].startsWith('/')
        ? opts['logFile']
        : join(ctx.projectRoot, opts['logFile']);
      if (!existsSync(absPath)) {
        return { success: false, output: `❌ Log file not found: ${absPath}`, error: 'log file not found' };
      }
      log = readFileSync(absPath, 'utf-8');
    } else {
      return { success: false, output: '❌ Provide `log` (string) or `logFile` (path) via ctx.graph', error: 'no log input' };
    }

    const platform = typeof opts['platform'] === 'string'
      ? (opts['platform'] as CIPlatform)
      : undefined;

    const report = parsePipelineLog(log, platform);

    const lines = [
      `🔍 Pipeline Aware — ${report.platform.toUpperCase()} (${report.totalLines} lines)`,
      `   ${report.summary}`,
      '',
    ];

    if (report.failures.length > 0) {
      for (const f of report.failures.slice(0, 10)) {
        const icon = f.severity === 'critical' ? '❌' : f.severity === 'high' ? '⚠️ ' : 'ℹ️ ';
        lines.push(`  ${icon} [${f.category}] ${f.step}`);
        lines.push(`     ${f.message.slice(0, 80)}`);
        lines.push(`     💡 ${f.suggestion}`);
        lines.push('');
      }
      if (report.failures.length > 10) {
        lines.push(`  … and ${report.failures.length - 10} more failure(s)`);
      }
    }

    return {
      success: report.status !== 'failed',
      output: lines.join('\n'),
      data: report,
    };
  },
};
