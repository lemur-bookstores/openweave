/**
 * Skill: refactor
 *
 * Detects common code smells in TypeScript source files and produces a prioritised
 * list of refactoring suggestions. Purely static / heuristic — no AST required.
 *
 * Detects:
 *   - Long functions     (> LONG_FUNCTION_LINES lines between opening { and matching })
 *   - Large files        (> LARGE_FILE_LINES total lines)
 *   - Magic numbers      (numeric literals that are not 0, 1, -1, 2, 100)
 *   - Deep nesting       (indentation depth > MAX_NESTING spaces / 2)
 *   - Long parameter lists (> MAX_PARAMS parameters in a function signature)
 *   - TODO / FIXME / HACK comments
 *   - Duplicate imports  (same module imported more than once)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Constants (overridable via ctx.graph)
// ---------------------------------------------------------------------------

const LONG_FUNCTION_LINES = 40;
const LARGE_FILE_LINES = 300;
const MAX_NESTING = 4;   // levels (each ~2 spaces, so 8 spaces indent)
const MAX_PARAMS = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SmellKind =
  | 'long-function'
  | 'large-file'
  | 'magic-number'
  | 'deep-nesting'
  | 'long-param-list'
  | 'todo-comment'
  | 'duplicate-import';

export interface RefactorSmell {
  file: string;
  line: number;
  kind: SmellKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
  detail?: string;
}

export interface RefactorResult {
  smells: RefactorSmell[];
  filesAnalyzed: number;
  summary: Record<SmellKind, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function detectSmells(source: string, filePath: string): RefactorSmell[] {
  const lines = source.split('\n');
  const smells: RefactorSmell[] = [];

  // ── Large file ──────────────────────────────────────────────────────────
  if (lines.length > LARGE_FILE_LINES) {
    smells.push({
      file: filePath,
      line: 1,
      kind: 'large-file',
      severity: 'warning',
      message: `File has ${lines.length} lines (threshold: ${LARGE_FILE_LINES})`,
    });
  }

  // ── Duplicate imports ────────────────────────────────────────────────────
  const importSeen = new Map<string, number>(); // module → first line
  const IMPORT_RE = /^\s*import\s+.+\s+from\s+['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (!m) continue;
    const mod = m[1];
    if (importSeen.has(mod)) {
      smells.push({
        file: filePath,
        line: i + 1,
        kind: 'duplicate-import',
        severity: 'warning',
        message: `Duplicate import of '${mod}' (first seen at line ${importSeen.get(mod)})`,
      });
    } else {
      importSeen.set(mod, i + 1);
    }
  }

  // ── Per-line checks ──────────────────────────────────────────────────────
  const funcStack: { startLine: number; name: string; depth: number }[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trimStart();

    // TODO / FIXME / HACK
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(trimmed)) {
      smells.push({
        file: filePath,
        line: lineNo,
        kind: 'todo-comment',
        severity: 'info',
        message: `TODO/FIXME comment at line ${lineNo}`,
        detail: trimmed.slice(0, 80),
      });
    }

    // Magic numbers
    // Exclude: 0, 1, -1, 2, 100, numbers inside imports/require, pure number literals in tests
    const MAGIC_RE = /(?<![.\w])(-?\b(?:[3-9]\d*|1\d+|2\d+)\b)(?!\s*[%,]?\s*\/\*)/g;
    const isCommentLine = trimmed.startsWith('//') || trimmed.startsWith('*');
    const isImportLine = /^\s*import\s/.test(line) || /require\(/.test(line);
    if (!isCommentLine && !isImportLine) {
      let mm: RegExpExecArray | null;
      while ((mm = MAGIC_RE.exec(line)) !== null) {
        const num = Number(mm[1]);
        if (Number.isFinite(num) && Math.abs(num) > 1 && num !== 100) {
          smells.push({
            file: filePath,
            line: lineNo,
            kind: 'magic-number',
            severity: 'info',
            message: `Magic number ${mm[1]} — consider extracting to a named constant`,
          });
        }
      }
    }

    // Deep nesting — count leading spaces (2 spaces = 1 level)
    const indent = line.length - trimmed.length;
    const nestLevel = Math.floor(indent / 2);
    if (nestLevel > MAX_NESTING && trimmed.length > 0 && !isCommentLine) {
      smells.push({
        file: filePath,
        line: lineNo,
        kind: 'deep-nesting',
        severity: 'warning',
        message: `Nesting depth ${nestLevel} exceeds threshold (${MAX_NESTING})`,
      });
    }

    // Long parameter lists in function/method signatures
    const PARAM_RE = /(?:function\s+\w+|(?:\w+)\s*=\s*(?:async\s+)?\()\s*([^)]{30,})\)/;
    const paramMatch = PARAM_RE.exec(line);
    if (paramMatch) {
      const params = paramMatch[1].split(',').filter((p) => p.trim().length > 0);
      if (params.length > MAX_PARAMS) {
        smells.push({
          file: filePath,
          line: lineNo,
          kind: 'long-param-list',
          severity: 'warning',
          message: `Function has ${params.length} parameters (threshold: ${MAX_PARAMS}) — consider an options object`,
        });
      }
    }

    // Brace tracking for long-function detection
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    // Detect function start
    const FUNC_START_RE = /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>\s*)?\{))/;
    const funcMatch = FUNC_START_RE.exec(line);
    if (funcMatch && line.includes('{')) {
      funcStack.push({ startLine: lineNo, name: funcMatch[1] ?? funcMatch[2] ?? '(anonymous)', depth: braceDepth });
    }

    braceDepth += opens - closes;

    // Check if function closed
    while (funcStack.length > 0 && braceDepth <= funcStack[funcStack.length - 1].depth) {
      const fn = funcStack.pop()!;
      const length = lineNo - fn.startLine + 1;
      if (length > LONG_FUNCTION_LINES) {
        smells.push({
          file: filePath,
          line: fn.startLine,
          kind: 'long-function',
          severity: 'warning',
          message: `Function '${fn.name}' is ${length} lines long (threshold: ${LONG_FUNCTION_LINES})`,
        });
      }
    }
  }

  return smells;
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const refactorSkill: SkillModule = {
  id: 'refactor',
  name: 'Refactor Advisor',
  description: 'Detects code smells (long functions, magic numbers, deep nesting, large files, etc.) and suggests refactoring',
  version: '1.0.0',
  enabled: false,
  tags: ['dev', 'quality'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const tsFiles = ctx.files.filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && !f.includes('/dist/')
    );

    const smells: RefactorSmell[] = [];

    for (const relPath of tsFiles) {
      const absPath = join(ctx.projectRoot, relPath);
      if (!existsSync(absPath)) continue;
      try {
        const content = readFileSync(absPath, 'utf-8');
        smells.push(...detectSmells(content, relPath));
      } catch { /* skip unreadable */ }
    }

    // Summary
    const summary = {} as Record<SmellKind, number>;
    for (const s of smells) {
      summary[s.kind] = (summary[s.kind] ?? 0) + 1;
    }

    const errors = smells.filter((s) => s.severity === 'error').length;
    const warnings = smells.filter((s) => s.severity === 'warning').length;
    const infos = smells.filter((s) => s.severity === 'info').length;

    const lines = [
      `♻️  Refactor Advisor — ${tsFiles.length} files analyzed`,
      `   ${errors} error(s), ${warnings} warning(s), ${infos} info(s)`,
      '',
    ];

    const SEVERITY_ORDER = ['error', 'warning', 'info'] as const;
    for (const sev of SEVERITY_ORDER) {
      const group = smells.filter((s) => s.severity === sev);
      if (group.length === 0) continue;
      lines.push(`  ${sev.toUpperCase()}S:`);
      for (const s of group.slice(0, 15)) {
        lines.push(`    ${s.file}:${s.line} [${s.kind}] ${s.message}`);
      }
      if (group.length > 15) lines.push(`    … and ${group.length - 15} more`);
      lines.push('');
    }

    return {
      success: true,
      output: lines.join('\n'),
      data: { smells, filesAnalyzed: tsFiles.length, summary } as RefactorResult,
    };
  },
};
