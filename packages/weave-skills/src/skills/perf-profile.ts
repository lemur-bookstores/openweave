/**
 * Skill: perf-profile
 *
 * Analyses build, test and bundle timing data and produces a prioritised
 * table of bottlenecks with actionable suggestions.
 *
 * Input options (ctx.graph):
 *   - `timings`    {TimingEntry[]}  — inject timing data directly (tests / CI JSON)
 *   - `ciLog`      {string}         — parse timing information from a raw CI log
 *   - `threshold`  {number}         — ms threshold to flag a step as slow (default: 10_000)
 */

import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimingEntry {
  label: string;       // e.g. "Build weave-graph", "Test weave-link"
  durationMs: number;
  category: 'build' | 'test' | 'bundle' | 'lint' | 'install' | 'other';
  package?: string;
}

export interface Bottleneck {
  label: string;
  durationMs: number;
  category: TimingEntry['category'];
  severity: 'critical' | 'warning' | 'info';
  suggestion: string;
}

export interface PerfReport {
  entries: TimingEntry[];
  bottlenecks: Bottleneck[];
  totalMs: number;
  slowestStep: TimingEntry | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Suggestions by category
// ---------------------------------------------------------------------------

const SUGGESTIONS: Record<TimingEntry['category'], string> = {
  build: 'Enable incremental TypeScript builds (`incremental: true` in tsconfig). Consider `isolatedModules`.',
  test: 'Use `--reporter=dot` or run only changed files with `--changed`. Parallelise across workers.',
  bundle: 'Enable Vite/esbuild caching. Code-split large entry points. Analyse bundle with `rollup-plugin-visualizer`.',
  lint: 'Use `lint-staged` to lint only staged files. Enable ESLint caching (`--cache`).',
  install: 'Use `pnpm install --frozen-lockfile`. Cache `~/.pnpm-store` in CI. Audit dep count.',
  other: 'Profile the step further to identify sub-task bottlenecks.',
};

// ---------------------------------------------------------------------------
// Log-based timing extraction
// ---------------------------------------------------------------------------

const TIMING_PATTERNS: Array<{
  pattern: RegExp;
  label: (m: RegExpExecArray, line?: string) => string;
  category: TimingEntry['category'];
}> = [
  // GitHub Actions step duration: "##[group]Run pnpm build (3m 12s)"
  {
    pattern: /##\[group\](.+?)\s+\((\d+)m\s+(\d+)s\)/i,
    label: (m) => m[1].trim(),
    category: 'build',
  },
  // Generic "Step X completed in Ns" or "done in Ns"
  {
    pattern: /(?:completed in|done in|finished in)\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?/i,
    label: (_m: RegExpExecArray, line?: string) => (line ?? 'step').trim().slice(0, 50),
    category: 'other',
  },
  // Vitest / Jest duration: "Duration  12.34 s"
  {
    pattern: /Duration\s+(\d+(?:\.\d+)?)\s*s\b/i,
    label: () => 'Test suite',
    category: 'test',
  },
  // npm/pnpm install: "added N packages in Xs"
  {
    pattern: /added\s+\d+\s+packages?\s+in\s+(\d+(?:\.\d+)?)\s*s/i,
    label: () => 'Package install',
    category: 'install',
  },
  // tsc timing
  {
    pattern: /tsc\s+.*?(\d+(?:\.\d+)?)\s*s(?:ec)?/i,
    label: () => 'TypeScript compile',
    category: 'build',
  },
];

export function extractTimingsFromLog(log: string): TimingEntry[] {
  const lines = log.split('\n');
  const entries: TimingEntry[] = [];

  for (const line of lines) {
    for (const rule of TIMING_PATTERNS) {
      const m = rule.pattern.exec(line);
      if (!m) continue;

      // Try to parse duration
      let durationMs = 0;
      if (rule.pattern.source.includes('(\\d+)m')) {
        // "Xm Ys" format
        const mins = parseInt(m[2], 10);
        const secs = parseInt(m[3], 10);
        durationMs = (mins * 60 + secs) * 1000;
      } else {
        // seconds as float
        const secIdx = m.findIndex((v, i) => i > 0 && /^\d+(\.\d+)?$/.test(v ?? ''));
        if (secIdx > 0) {
          durationMs = Math.round(parseFloat(m[secIdx]) * 1000);
        }
      }

      if (durationMs > 0) {
        entries.push({
          label: rule.label(m, line),
          durationMs,
          category: rule.category,
        });
        break;
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analyseTimings(entries: TimingEntry[], threshold = 10_000): PerfReport {
  if (entries.length === 0) {
    return {
      entries: [],
      bottlenecks: [],
      totalMs: 0,
      slowestStep: null,
      summary: 'No timing data available',
    };
  }

  const sorted = [...entries].sort((a, b) => b.durationMs - a.durationMs);
  const slowest = sorted[0];
  const totalMs = entries.reduce((sum, e) => sum + e.durationMs, 0);

  const bottlenecks: Bottleneck[] = sorted
    .filter((e) => e.durationMs >= threshold / 2)  // surface anything ≥ half the threshold
    .map((e) => {
      let severity: Bottleneck['severity'] = 'info';
      if (e.durationMs >= threshold) severity = 'critical';
      else if (e.durationMs >= threshold * 0.6) severity = 'warning';

      return {
        label: e.label,
        durationMs: e.durationMs,
        category: e.category,
        severity,
        suggestion: SUGGESTIONS[e.category],
      };
    });

  const criticals = bottlenecks.filter((b) => b.severity === 'critical').length;
  const summary = criticals > 0
    ? `❌ ${criticals} step(s) exceed ${threshold / 1000}s threshold — total pipeline: ${(totalMs / 1000).toFixed(1)}s`
    : `✅ All steps within threshold — total: ${(totalMs / 1000).toFixed(1)}s`;

  return { entries, bottlenecks, totalMs, slowestStep: slowest, summary };
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const perfProfileSkill: SkillModule = {
  id: 'perf-profile',
  name: 'Perf Profiler',
  description: 'Analyses build/test/bundle timing data and surfaces bottlenecks with optimisation suggestions',
  version: '1.0.0',
  enabled: false,
  tags: ['devops', 'performance'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    const threshold = typeof opts['threshold'] === 'number' ? opts['threshold'] : 10_000;

    let entries: TimingEntry[] = [];

    if (Array.isArray(opts['timings'])) {
      entries = opts['timings'] as TimingEntry[];
    } else if (typeof opts['ciLog'] === 'string') {
      entries = extractTimingsFromLog(opts['ciLog']);
    }

    const report = analyseTimings(entries, threshold);

    const lines = [
      `⏱  Perf Profiler — ${report.entries.length} timing entries`,
      `   ${report.summary}`,
      '',
    ];

    if (report.bottlenecks.length > 0) {
      lines.push('  BOTTLENECKS (slowest first):');
      for (const b of report.bottlenecks) {
        const icon = b.severity === 'critical' ? '❌' : b.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        const dur = b.durationMs >= 60_000
          ? `${(b.durationMs / 60_000).toFixed(1)}m`
          : `${(b.durationMs / 1000).toFixed(1)}s`;
        lines.push(`  ${icon} ${b.label} [${b.category}] — ${dur}`);
        lines.push(`     💡 ${b.suggestion}`);
        lines.push('');
      }
    } else {
      lines.push('  ✅ No bottlenecks detected.');
    }

    return {
      success: report.bottlenecks.filter((b) => b.severity === 'critical').length === 0,
      output: lines.join('\n'),
      data: report,
    };
  },
};
