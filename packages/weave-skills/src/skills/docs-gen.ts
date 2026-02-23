/**
 * Skill: docs-gen
 *
 * Generates documentation stubs for exported TypeScript entities that lack JSDoc,
 * and produces a CHANGELOG draft from conventional commits.
 *
 * Two modes (controlled via ctx.graph options):
 *   - `mode: 'jsdoc'`     — scan for undocumented exports → generate JSDoc stubs
 *   - `mode: 'changelog'` — parse git log → draft CHANGELOG.md section
 *   - `mode: 'both'`      — run both (default)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndocumentedEntity {
  file: string;
  line: number;
  name: string;
  kind: 'function' | 'class' | 'const' | 'interface' | 'type';
  stub: string;
}

export interface ChangelogEntry {
  hash: string;
  type: string;
  scope: string;
  message: string;
}

export interface DocsGenResult {
  undocumented: UndocumentedEntity[];
  changelog: ChangelogEntry[];
  jsDocStubs: string; // combined stub content ready to paste
  changelogSection: string; // Markdown section for CHANGELOG.md
}

// ---------------------------------------------------------------------------
// JSDoc analysis
// ---------------------------------------------------------------------------

const EXPORTED_SYMBOL_RE = /^(export\s+(?:async\s+)?function|export\s+(?:abstract\s+)?class|export\s+(?:const|let|var)\s+\w+|export\s+interface\s+\w+|export\s+type\s+\w+)/;
const NAME_RE = /(?:function|class|interface|type|const|let|var)\s+(\w+)/;

export function findUndocumentedExports(source: string, filePath: string): UndocumentedEntity[] {
  const lines = source.split('\n');
  const results: UndocumentedEntity[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!EXPORTED_SYMBOL_RE.test(line)) continue;

    // Check previous lines for a JSDoc block
    const prevLine = lines[i - 1]?.trimEnd() ?? '';
    const hasDocs = prevLine.trimEnd().endsWith('*/') || prevLine.trimStart().startsWith('* ') || prevLine.trimStart().startsWith('/**');
    if (hasDocs) continue;

    const nameMatch = NAME_RE.exec(line);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    let kind: UndocumentedEntity['kind'] = 'const';
    if (/export\s+(?:async\s+)?function/.test(line)) kind = 'function';
    else if (/export\s+(?:abstract\s+)?class/.test(line)) kind = 'class';
    else if (/export\s+interface/.test(line)) kind = 'interface';
    else if (/export\s+type/.test(line)) kind = 'type';

    const stub = generateJsDoc(name, kind);
    results.push({ file: filePath, line: i + 1, name, kind, stub });
  }

  return results;
}

function generateJsDoc(name: string, kind: UndocumentedEntity['kind']): string {
  const lines = ['/**'];
  lines.push(` * ${name}`);
  if (kind === 'function') {
    lines.push(` *`);
    lines.push(` * @param args - TODO: document parameters`);
    lines.push(` * @returns TODO: describe return value`);
  } else if (kind === 'class') {
    lines.push(` *`);
    lines.push(` * @example`);
    lines.push(` * \`\`\`typescript`);
    lines.push(` * const instance = new ${name}();`);
    lines.push(` * \`\`\``);
  }
  lines.push(` */`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Changelog from git log
// ---------------------------------------------------------------------------

const CONVENTIONAL_RE = /^([a-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/;

export function parseConventionalCommits(gitLog: string): ChangelogEntry[] {
  return gitLog
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split(' ');
      const msg = rest.join(' ');
      const m = CONVENTIONAL_RE.exec(msg);
      if (!m) return null;
      return { hash: hash.slice(0, 7), type: m[1], scope: m[2] ?? '', message: m[3] };
    })
    .filter((e): e is ChangelogEntry => e !== null);
}

export function renderChangelogSection(entries: ChangelogEntry[], version = 'Unreleased'): string {
  if (entries.length === 0) return `## [${version}]\n\n_No conventional commits found._\n`;

  const groups: Record<string, ChangelogEntry[]> = {};
  for (const e of entries) {
    (groups[e.type] ??= []).push(e);
  }

  const ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'ci'];
  const LABELS: Record<string, string> = {
    feat: '✨ Features', fix: '🐛 Bug Fixes', perf: '⚡ Performance',
    refactor: '♻️  Refactoring', docs: '📚 Documentation', test: '🧪 Tests',
    chore: '🔧 Chores', ci: '⚙️  CI',
  };

  const lines = [`## [${version}] — ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const type of [...ORDER, ...Object.keys(groups).filter((t) => !ORDER.includes(t))]) {
    if (!groups[type]) continue;
    lines.push(`### ${LABELS[type] ?? type}`);
    for (const e of groups[type]) {
      const scope = e.scope ? ` **${e.scope}:**` : '';
      lines.push(`- \`${e.hash}\`${scope} ${e.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const docsGenSkill: SkillModule = {
  id: 'docs-gen',
  name: 'Docs Generator',
  description: 'Generates JSDoc stubs for undocumented exports and drafts CHANGELOG from conventional commits',
  version: '1.0.0',
  enabled: false,
  tags: ['dev', 'docs'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    const mode = String(opts['mode'] ?? 'both');
    const version = String(opts['version'] ?? 'Unreleased');

    const undocumented: UndocumentedEntity[] = [];
    const changelog: ChangelogEntry[] = [];
    let jsDocStubs = '';
    let changelogSection = '';

    // --- JSDoc mode ---
    if (mode === 'jsdoc' || mode === 'both') {
      const tsFiles = ctx.files.filter(
        (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && !f.includes('/dist/')
      );

      for (const relPath of tsFiles) {
        const absPath = join(ctx.projectRoot, relPath);
        if (!existsSync(absPath)) continue;
        try {
          const content = readFileSync(absPath, 'utf-8');
          undocumented.push(...findUndocumentedExports(content, relPath));
        } catch { /* skip unreadable */ }
      }

      if (undocumented.length > 0) {
        jsDocStubs = undocumented
          .map((u) => `// ${u.file}:${u.line} — ${u.name}\n${u.stub}`)
          .join('\n\n');
      }
    }

    // --- Changelog mode ---
    if (mode === 'changelog' || mode === 'both') {
      try {
        const gitLog = execSync('git log --oneline --no-merges -50', {
          cwd: ctx.projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        });
        const entries = parseConventionalCommits(gitLog);
        changelog.push(...entries);
        changelogSection = renderChangelogSection(entries, version);
      } catch {
        changelogSection = '_(git log unavailable)_';
      }
    }

    const lines = [`📚 Docs Generator`, ''];
    if (mode !== 'changelog') {
      lines.push(`  JSDoc gaps: ${undocumented.length} undocumented exports`);
      if (undocumented.length > 0) {
        for (const u of undocumented.slice(0, 10)) {
          lines.push(`  ⬜ ${u.file}:${u.line} — ${u.kind} ${u.name}`);
        }
        if (undocumented.length > 10) lines.push(`  … and ${undocumented.length - 10} more`);
      }
    }
    if (mode !== 'jsdoc') {
      lines.push('');
      lines.push(`  CHANGELOG: ${changelog.length} conventional commit(s) parsed`);
    }

    return {
      success: true,
      output: lines.join('\n'),
      data: { undocumented, changelog, jsDocStubs, changelogSection } as DocsGenResult,
    };
  },
};
