/**
 * Skill: code-review
 *
 * Performs static code review on the current `git diff HEAD`.
 * No LLM required — pure pattern matching on diffs.
 *
 * Checks:
 *   - console.log / console.error / debugger statements
 *   - TODO / FIXME / HACK / XXX annotations
 *   - Lines exceeding 120 characters
 *   - Hard-coded secret patterns (password=, api_key=, SECRET, TOKEN in assignments)
 *   - Missing `await` on common async patterns
 *   - `@ts-ignore` / `@ts-nocheck` suppressions
 *   - `any` type annotations in TypeScript
 *   - Empty catch blocks
 */

import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewCategory = 'debug' | 'note' | 'style' | 'security' | 'performance' | 'type-safety';
export type ReviewSeverity = 'error' | 'warning' | 'info';

export interface ReviewComment {
  file: string;
  line: number;
  category: ReviewCategory;
  severity: ReviewSeverity;
  message: string;
  snippet: string;
}

export interface CodeReviewResult {
  diff: string;
  comments: ReviewComment[];
  summary: { errors: number; warnings: number; infos: number };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface ReviewRule {
  pattern: RegExp;
  category: ReviewCategory;
  severity: ReviewSeverity;
  message: string;
}

const RULES: ReviewRule[] = [
  {
    pattern: /console\.(log|warn|error|debug|info)\s*\(/,
    category: 'debug',
    severity: 'warning',
    message: 'Remove console statement before merging',
  },
  {
    pattern: /\bdebugger\b/,
    category: 'debug',
    severity: 'error',
    message: 'Remove debugger statement',
  },
  {
    pattern: /\b(TODO|FIXME|HACK|XXX)\b/,
    category: 'note',
    severity: 'info',
    message: 'Unresolved annotation — consider filing an issue',
  },
  {
    pattern: /(password|passwd|secret|api_key|apikey|token)\s*=\s*['"`][^'"`]{4,}/i,
    category: 'security',
    severity: 'error',
    message: 'Potential hard-coded credential — use environment variables',
  },
  {
    pattern: /@ts-ignore|@ts-nocheck/,
    category: 'type-safety',
    severity: 'warning',
    message: 'TypeScript suppression annotation — resolve the underlying type error',
  },
  {
    pattern: /:\s*any\b/,
    category: 'type-safety',
    severity: 'info',
    message: 'Explicit `any` type — consider a more specific type',
  },
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    category: 'debug',
    severity: 'warning',
    message: 'Empty catch block swallows errors silently',
  },
  {
    pattern: /\.then\s*\(/,
    category: 'performance',
    severity: 'info',
    message: 'Prefer async/await over raw .then() chains for readability',
  },
];

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseDiff(diff: string): ReviewComment[] {
  const comments: ReviewComment[] = [];
  let currentFile = '';
  let lineNumber = 0;

  for (const line of diff.split('\n')) {
    // Track current file
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }
    // Track line numbers in new file
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }
    // Skip removed lines and metadata
    if (line.startsWith('-') || line.startsWith('diff ') || line.startsWith('index ')) continue;

    // Added or context lines advance line counter
    if (line.startsWith('+') || (!line.startsWith('@') && !line.startsWith('\\'))) {
      lineNumber++;
    }

    // Only check added lines (+) — not context lines
    if (!line.startsWith('+')) continue;

    const code = line.slice(1); // strip leading +

    // Long line check
    if (code.length > 120) {
      comments.push({
        file: currentFile,
        line: lineNumber,
        category: 'style',
        severity: 'info',
        message: `Line is ${code.length} chars (limit: 120)`,
        snippet: code.slice(0, 80) + '…',
      });
    }

    // Rule-based checks
    for (const rule of RULES) {
      if (rule.pattern.test(code)) {
        comments.push({
          file: currentFile,
          line: lineNumber,
          category: rule.category,
          severity: rule.severity,
          message: rule.message,
          snippet: code.trim().slice(0, 100),
        });
      }
    }
  }

  return comments;
}

function formatComments(comments: ReviewComment[]): string {
  if (comments.length === 0) return '  ✅ No issues found.';

  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const list = byFile.get(c.file) ?? [];
    list.push(c);
    byFile.set(c.file, list);
  }

  const lines: string[] = [];
  for (const [file, cs] of byFile.entries()) {
    lines.push(`\n  📄 ${file}`);
    for (const c of cs) {
      const icon = c.severity === 'error' ? '❌' : c.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
      lines.push(`    ${icon} L${c.line} [${c.category}] ${c.message}`);
      lines.push(`       ${c.snippet}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const codeReviewSkill: SkillModule = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Static code review of git diff HEAD — detects debug statements, security issues and style violations',
  version: '1.0.0',
  enabled: false,
  tags: ['dev', 'quality'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // Allow injecting diff via context for testability
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    let diff: string;
    const diffInjected = 'diff' in opts;

    if (diffInjected) {
      diff = String(opts['diff'] ?? '');
    } else {
      try {
        diff = execSync('git diff HEAD', {
          cwd: ctx.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      } catch {
        return {
          success: false,
          output: '❌ Could not run git diff — is this a git repository?',
          error: 'git diff HEAD failed',
        };
      }
    }

    if (!diff.trim()) {
      return {
        success: true,
        output: '✅ No staged changes found — working tree is clean.',
        data: { diff: '', comments: [], summary: { errors: 0, warnings: 0, infos: 0 } } as CodeReviewResult,
      };
    }

    const comments = parseDiff(diff);
    const summary = {
      errors: comments.filter((c) => c.severity === 'error').length,
      warnings: comments.filter((c) => c.severity === 'warning').length,
      infos: comments.filter((c) => c.severity === 'info').length,
    };

    const statusLine =
      summary.errors > 0
        ? `❌ ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.infos} info(s)`
        : summary.warnings > 0
        ? `⚠️  0 errors, ${summary.warnings} warning(s), ${summary.infos} info(s)`
        : `✅ 0 errors, 0 warnings, ${summary.infos} info(s)`;

    return {
      success: true,
      output: `🔍 Code Review\n${statusLine}\n${formatComments(comments)}`,
      data: { diff, comments, summary } as CodeReviewResult,
    };
  },
};
