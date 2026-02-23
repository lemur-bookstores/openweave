/**
 * Skill: test-gen
 *
 * Detects exported TypeScript functions and classes that have no corresponding
 * test file, then generates Vitest-compatible test stubs.
 *
 * Strategy:
 *   1. Walk ctx.files for *.ts files (excluding *.test.ts and *.d.ts)
 *   2. For each source file, check if a <name>.test.ts exists next to it
 *   3. Parse exported function/class names via regex (fast, no full AST)
 *   4. Generate a stub test file matching the project's Vitest patterns
 *
 * Output data:
 *   - untested: UncoveredFile[]    — files with no test counterpart
 *   - stubs: TestStub[]           — generated test stubs (not written to disk)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UncoveredFile {
  sourcePath: string;
  exports: string[];
}

export interface TestStub {
  testFilePath: string;
  sourcePath: string;
  content: string;
}

export interface TestGenResult {
  untested: UncoveredFile[];
  stubs: TestStub[];
  totalSourceFiles: number;
  testedCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPORT_FN_RE = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
const EXPORT_CLASS_RE = /^export\s+(?:abstract\s+)?class\s+(\w+)/gm;
const EXPORT_CONST_FN_RE = /^export\s+(?:const|let)\s+(\w+)\s*[=:]/gm;
const EXPORT_DEFAULT_RE = /^export\s+default\s+(?:function\s+)?(\w+)/gm;
const REEXPORT_RE = /^export\s*\{[^}]+\}\s*from/m;

export function extractExports(content: string): string[] {
  // Skip pure re-export files
  if (REEXPORT_RE.test(content) && !EXPORT_FN_RE.test(content)) return [];

  const names = new Set<string>();
  let m: RegExpExecArray | null;

  EXPORT_FN_RE.lastIndex = 0;
  while ((m = EXPORT_FN_RE.exec(content)) !== null) names.add(m[1]);

  EXPORT_CLASS_RE.lastIndex = 0;
  while ((m = EXPORT_CLASS_RE.exec(content)) !== null) names.add(m[1]);

  EXPORT_CONST_FN_RE.lastIndex = 0;
  while ((m = EXPORT_CONST_FN_RE.exec(content)) !== null) {
    if (m[1] !== 'type' && m[1] !== 'interface') names.add(m[1]);
  }

  EXPORT_DEFAULT_RE.lastIndex = 0;
  while ((m = EXPORT_DEFAULT_RE.exec(content)) !== null) names.add(m[1]);

  return Array.from(names);
}

function testFilePath(sourcePath: string): string {
  const dir = dirname(sourcePath);
  const base = basename(sourcePath, extname(sourcePath));
  return join(dir, `${base}.test.ts`);
}

export function generateStub(sourcePath: string, exportNames: string[]): string {
  const base = basename(sourcePath, '.ts');
  const relPath = `./${base}.js`;

  const imports = exportNames.length > 0
    ? `import { ${exportNames.join(', ')} } from '${relPath}';\n`
    : `// import { ... } from '${relPath}';\n`;

  const describes = exportNames.map((name) =>
    [
      `describe('${name}', () => {`,
      `  it('should be defined', () => {`,
      `    expect(${name}).toBeDefined();`,
      `  });`,
      ``,
      `  it('TODO: add meaningful test', () => {`,
      `    // Arrange`,
      `    // Act`,
      `    // Assert`,
      `    expect(true).toBe(true);`,
      `  });`,
      `});`,
    ].join('\n')
  );

  return [
    `import { describe, it, expect } from 'vitest';`,
    imports,
    ...describes,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const testGenSkill: SkillModule = {
  id: 'test-gen',
  name: 'Test Generator',
  description: 'Detects untested exported functions/classes and generates Vitest test stubs',
  version: '1.0.0',
  enabled: false,
  tags: ['dev', 'quality'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const tsFiles = ctx.files
      .filter(
        (f) =>
          f.endsWith('.ts') &&
          !f.endsWith('.test.ts') &&
          !f.endsWith('.d.ts') &&
          !f.includes('node_modules') &&
          !f.includes('/dist/')
      );

    if (tsFiles.length === 0) {
      return {
        success: true,
        output: 'No TypeScript source files found in context.',
        data: { untested: [], stubs: [], totalSourceFiles: 0, testedCount: 0 } as TestGenResult,
      };
    }

    const untested: UncoveredFile[] = [];
    let testedCount = 0;

    for (const relPath of tsFiles) {
      const absPath = join(ctx.projectRoot, relPath);
      const testPath = testFilePath(absPath);

      if (existsSync(testPath)) {
        testedCount++;
        continue;
      }

      let content = '';
      try {
        content = readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }

      const exports = extractExports(content);
      if (exports.length > 0) {
        untested.push({ sourcePath: relPath, exports });
      }
    }

    const stubs: TestStub[] = untested.map((u) => ({
      testFilePath: testFilePath(join(ctx.projectRoot, u.sourcePath)),
      sourcePath: u.sourcePath,
      content: generateStub(u.sourcePath, u.exports),
    }));

    const lines = [
      `🧪 Test Generator`,
      `Source files: ${tsFiles.length} | Tested: ${testedCount} | Missing tests: ${untested.length}`,
      '',
    ];

    if (untested.length === 0) {
      lines.push('  ✅ All exported files have test counterparts.');
    } else {
      lines.push('  Files missing tests:');
      for (const u of untested) {
        lines.push(`  ⬜ ${u.sourcePath}`);
        lines.push(`     Exports: ${u.exports.slice(0, 5).join(', ')}${u.exports.length > 5 ? '…' : ''}`);
      }
      lines.push('');
      lines.push(`  💡 ${stubs.length} test stub(s) generated (see data.stubs)`);
    }

    return {
      success: true,
      output: lines.join('\n'),
      data: { untested, stubs, totalSourceFiles: tsFiles.length, testedCount } as TestGenResult,
    };
  },
};
