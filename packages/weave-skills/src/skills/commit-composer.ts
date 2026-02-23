/**
 * Skill: commit-composer
 *
 * Analyses `git diff --staged` and proposes a Conventional Commits message.
 * No LLM required — pure pattern-matching on diff hunks.
 *
 * Conventional format: <type>(<scope>): <description>
 *   [optional body]
 *   [optional footer: BREAKING CHANGE: ...]
 *
 * Types detected: feat, fix, docs, style, refactor, test, chore, perf, ci, build
 *
 * Input (via SkillContext.graph):
 *   - `ctx.graph['diff']`       — staged diff string (injectable for tests)
 *   - `ctx.graph['stagedFiles']` — string[] (overrides ctx.git?.stagedFiles)
 *
 * Output data:
 *   - CommitComposerResult
 */

import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConventionalType =
  | 'feat'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'test'
  | 'chore'
  | 'perf'
  | 'ci'
  | 'build';

export interface CommitComposerResult {
  suggestedMessage: string;
  type: ConventionalType;
  scope: string | null;
  description: string;
  breakingChange: boolean;
  breakingChangeNote: string | null;
  changedFiles: string[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

// ---------------------------------------------------------------------------
// Diff analysis
// ---------------------------------------------------------------------------

interface DiffStats {
  additions: number;
  deletions: number;
  filesChanged: string[];
}

export function parseDiffStats(diff: string): DiffStats {
  const additions = (diff.match(/^\+[^+]/gm) ?? []).length;
  const deletions = (diff.match(/^-[^-]/gm) ?? []).length;
  const filesChanged: string[] = [];
  for (const m of diff.matchAll(/^(?:---|\+\+\+) (?:a\/|b\/)?(.+)$/gm)) {
    const f = m[1].trim();
    if (f !== '/dev/null' && !filesChanged.includes(f)) {
      filesChanged.push(f);
    }
  }
  return { additions, deletions, filesChanged };
}

export function detectScope(files: string[]): string | null {
  if (files.length === 0) return null;

  // pnpm workspace package scope
  const pkgMatch = files[0].match(/^(?:packages|apps)\/([^/]+)\//);
  if (pkgMatch) {
    const pkg = pkgMatch[1];
    // strip weave- prefix for brevity
    return pkg.replace(/^weave-/, '');
  }

  // top-level directory scope
  const topDir = files[0].split('/')[0];
  if (topDir && topDir !== files[0]) return topDir;

  return null;
}

interface TypeRule {
  type: ConventionalType;
  patterns: RegExp[];
}

const TYPE_RULES: TypeRule[] = [
  {
    type: 'test',
    patterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/, /__tests__\//],
  },
  {
    type: 'docs',
    patterns: [/\.md$/, /docs\//],
  },
  {
    type: 'ci',
    patterns: [/\.github\//, /\.gitlab-ci\.yml/, /ci\//],
  },
  {
    type: 'build',
    patterns: [/tsconfig/, /package\.json$/, /vite\.config/, /webpack/, /rollup/],
  },
  {
    type: 'style',
    patterns: [/\.css$/, /\.scss$/, /\.less$/, /\.svg$/, /\.png$/],
  },
  {
    type: 'chore',
    patterns: [/\.gitignore$/, /\.npmrc$/, /\.env/, /pnpm-lock/],
  },
];

export function detectType(files: string[], diff: string): ConventionalType {
  // If all files match a specific type, use it
  for (const rule of TYPE_RULES) {
    if (files.length > 0 && files.every((f) => rule.patterns.some((p) => p.test(f)))) {
      return rule.type;
    }
  }

  // Check diff content for semantic clues
  const addedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');

  const isFeature =
    /\bexport\s+(function|class|const|interface|type)\b/.test(addedLines) ||
    /\bnew\s+\w+\s*\(/.test(addedLines);

  const isFix =
    /\b(fix|bug|error|exception|catch|throw)\b/i.test(addedLines) ||
    /\b(null|undefined)\s*\?\?/.test(addedLines);

  const isRefactor = /\bextract|rename|move|reorganize|simplify\b/i.test(addedLines);
  const isPerf = /\bcache|memoize|debounce|throttle|optimize\b/i.test(addedLines);

  if (isPerf) return 'perf';
  if (isFix) return 'fix';
  if (isRefactor) return 'refactor';
  if (isFeature) return 'feat';
  return 'chore';
}

export function detectBreakingChange(diff: string): { breaking: boolean; note: string | null } {
  const removedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .join('\n');

  // Removed exports = potentially breaking
  if (/^-\s*export\s+(function|class|const|interface|type)\s+\w+/m.test(removedLines)) {
    return { breaking: true, note: 'Removed public export — downstream consumers may break' };
  }
  // Removed function parameters
  if (/^-.*function\s+\w+\s*\([^)]+\)/m.test(removedLines)) {
    return { breaking: true, note: 'Changed function signature' };
  }
  // BREAKING CHANGE in commit note markers already in diff
  if (/BREAKING[\s_-]CHANGE/i.test(diff)) {
    return { breaking: true, note: 'Breaking change marked in source' };
  }
  return { breaking: false, note: null };
}

export function buildDescription(
  type: ConventionalType,
  _scope: string | null,
  _stats: DiffStats,
  files: string[],
): string {
  const mainFile = files[0] ?? 'codebase';
  const base = mainFile.replace(/^.*\//, '').replace(/\.[tj]sx?$/, '');

  const descriptions: Record<ConventionalType, string> = {
    feat: `add ${base}`,
    fix: `resolve issue in ${base}`,
    docs: `update documentation`,
    style: `apply style changes`,
    refactor: `refactor ${base}`,
    test: `add tests for ${base}`,
    chore: `update project config`,
    perf: `improve performance of ${base}`,
    ci: `update CI/CD configuration`,
    build: `update build configuration`,
  };

  return descriptions[type];
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const commitComposerSkill: SkillModule = {
  id: 'commit-composer',
  name: 'Commit Message Composer',
  description:
    'Analyses staged git diff and proposes a Conventional Commits message with type, scope and description.',
  version: '1.0.0',
  enabled: true,
  tags: ['git', 'dx', 'commit'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const graph = (ctx.graph ?? {}) as Record<string, unknown>;

    // --- Get diff ---
    let diff = '';
    if (typeof graph['diff'] === 'string') {
      diff = graph['diff'];
    } else {
      try {
        diff = execSync('git diff --staged', {
          cwd: ctx.projectRoot,
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch {
        return {
          success: false,
          output: 'Failed to read staged diff — is this a git repository with staged changes?',
          error: 'git diff --staged failed',
        };
      }
    }

    if (!diff.trim()) {
      return {
        success: false,
        output: 'No staged changes found. Stage files with `git add` before composing a commit.',
        error: 'empty diff',
      };
    }

    const stats = parseDiffStats(diff);

    // --- File list ---
    const stagedFiles = Array.isArray(graph['stagedFiles'])
      ? (graph['stagedFiles'] as string[])
      : (ctx.git?.stagedFiles ?? stats.filesChanged);

    const type = detectType(stagedFiles, diff);
    const scope = detectScope(stagedFiles);
    const description = buildDescription(type, scope, stats, stagedFiles);
    const { breaking, note } = detectBreakingChange(diff);

    // Build message
    const header = scope
      ? `${type}(${scope}): ${description}`
      : `${type}: ${description}`;

    const bodyLines: string[] = [];
    if (stats.filesChanged.length > 1) {
      bodyLines.push(`Changed ${stats.filesChanged.length} files (+${stats.additions}/-${stats.deletions} lines)`);
    }
    if (breaking && note) {
      bodyLines.push('', `BREAKING CHANGE: ${note}`);
    }

    const suggestedMessage = bodyLines.length > 0
      ? `${header}\n\n${bodyLines.join('\n')}`
      : header;

    const result: CommitComposerResult = {
      suggestedMessage,
      type,
      scope,
      description,
      breakingChange: breaking,
      breakingChangeNote: note,
      changedFiles: stagedFiles,
      stats: {
        additions: stats.additions,
        deletions: stats.deletions,
        filesChanged: stats.filesChanged.length,
      },
    };

    return {
      success: true,
      output: `Suggested commit: "${header}"${breaking ? ' ⚠️  BREAKING CHANGE' : ''}`,
      data: result,
    };
  },
};
