import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// auto-fix
// ──────────────────────────────────────────────────────────────────────────
import { parseVulnFile, autoFixSkill } from './auto-fix.js';
import type { AutoFixResult } from './auto-fix.js';

describe('auto-fix — parseVulnFile', () => {
  it('parses title from H1 heading', () => {
    const md = `# SQL Injection in query builder\n\n**Severity:** High\n`;
    const r = parseVulnFile(md, 'VULN-001.md');
    expect(r.title).toBe('SQL Injection in query builder');
  });

  it('parses severity (case-insensitive)', () => {
    const md = `# X\n**severity:** critical\n`;
    const r = parseVulnFile(md, 'VULN-002.md');
    expect(r.severity.toLowerCase()).toBe('critical');
  });

  it('defaults severity to Unknown when absent', () => {
    const r = parseVulnFile('# Title\n', 'VULN-003.md');
    expect(r.severity).toBe('Unknown');
  });

  it('extracts id from filename', () => {
    const r = parseVulnFile('# T\n', 'VULN-007.md');
    expect(r.id).toBe('VULN-007');
  });

  it('marks status as pending', () => {
    const r = parseVulnFile('# T\n', 'x.md');
    expect(r.status).toBe('pending');
  });
});

describe('auto-fix — skill execute (dry-run, empty dir)', () => {
  it('returns success with 0 vulns when sentinelDir does not exist', async () => {
    const ctx = {
      projectRoot: '/nonexistent',
      files: [],
      graph: { sentinelDir: '/nonexistent/__sentinel__' },
      session: null,
      git: null,
    };
    const result = await autoFixSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as AutoFixResult;
    expect(data.vulns).toHaveLength(0);
    expect(data.dryRun).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// code-review
// ──────────────────────────────────────────────────────────────────────────
import { parseDiff, codeReviewSkill } from './code-review.js';
import type { CodeReviewResult } from './code-review.js';

const SAMPLE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,10 @@
+import * as fs from 'fs';
+import * as fs from 'fs';
 export function doThing() {
+  console.log('debug value');
+  debugger;
+  // TODO: remove this later
+  const x: any = {};
 }
`;

describe('code-review — parseDiff', () => {
  it('detects console.log', () => {
    const comments = parseDiff(SAMPLE_DIFF);
    expect(comments.some((c) => c.category === 'debug' && /console/.test(c.message))).toBe(true);
  });

  it('detects debugger statement', () => {
    const comments = parseDiff(SAMPLE_DIFF);
    expect(comments.some((c) => /debugger/.test(c.message))).toBe(true);
  });

  it('detects TODO comment', () => {
    const comments = parseDiff(SAMPLE_DIFF);
    expect(comments.some((c) => c.category === 'note')).toBe(true);
  });

  it('detects :any type', () => {
    const comments = parseDiff(SAMPLE_DIFF);
    expect(comments.some((c) => c.category === 'type-safety')).toBe(true);
  });

  it('returns empty array for empty diff', () => {
    expect(parseDiff('')).toHaveLength(0);
  });
});

describe('code-review — skill execute (injected diff)', () => {
  it('returns success with comments from injected diff', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { diff: SAMPLE_DIFF },
      session: null,
      git: null,
    };
    const result = await codeReviewSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as CodeReviewResult;
    expect(data.comments.length).toBeGreaterThan(0);
  });

  it('returns success with empty diff', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { diff: '' },
      session: null,
      git: null,
    };
    const result = await codeReviewSkill.execute(ctx);
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// test-gen
// ──────────────────────────────────────────────────────────────────────────
import { extractExports, generateStub, testGenSkill } from './test-gen.js';
import type { TestGenResult } from './test-gen.js';

describe('test-gen — extractExports', () => {
  it('extracts named function exports', () => {
    expect(extractExports('export function foo() {}\nexport function bar() {}')).toContain('foo');
  });

  it('extracts export const arrow functions', () => {
    expect(extractExports('export const myFn = () => {};')).toContain('myFn');
  });

  it('extracts export class', () => {
    expect(extractExports('export class MyClass {}')).toContain('MyClass');
  });

  it('ignores non-exported symbols', () => {
    expect(extractExports('function internal() {}')).toHaveLength(0);
  });

  it('returns empty array for empty source', () => {
    expect(extractExports('')).toHaveLength(0);
  });
});

describe('test-gen — generateStub', () => {
  it('generates a describe block', () => {
    const stub = generateStub('src/utils.ts', ['foo', 'bar']);
    expect(stub).toContain("describe('foo'");
    expect(stub).toContain('foo');
    expect(stub).toContain('bar');
  });

  it('generates vitest import line', () => {
    const stub = generateStub('src/utils.ts', ['fn']);
    expect(stub).toContain("from 'vitest'");
  });
});

describe('test-gen — skill execute (empty file list)', () => {
  it('returns success with 0 untested files when files is empty', async () => {
    const ctx = { projectRoot: '/tmp', files: [], graph: null, session: null, git: null };
    const result = await testGenSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as TestGenResult;
    expect(data.untested).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// docs-gen
// ──────────────────────────────────────────────────────────────────────────
import { findUndocumentedExports, parseConventionalCommits, renderChangelogSection, docsGenSkill } from './docs-gen.js';

describe('docs-gen — findUndocumentedExports', () => {
  it('detects undocumented export function', () => {
    const src = `export function undoc() {}\n`;
    const result = findUndocumentedExports(src, 'a.ts');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('undoc');
    expect(result[0].kind).toBe('function');
  });

  it('skips documented function', () => {
    const src = `/**\n * documented\n */\nexport function doc() {}\n`;
    expect(findUndocumentedExports(src, 'a.ts')).toHaveLength(0);
  });

  it('detects undocumented export class', () => {
    const src = `export class Foo {}\n`;
    const result = findUndocumentedExports(src, 'a.ts');
    expect(result[0].kind).toBe('class');
  });

  it('detects undocumented export const', () => {
    const src = `export const BAR = 42;\n`;
    const result = findUndocumentedExports(src, 'a.ts');
    expect(result[0].name).toBe('BAR');
  });
});

describe('docs-gen — parseConventionalCommits', () => {
  const log = `abc1234 feat(core): add skill registry\ndef5678 fix(cli): correct help text\nbad line\n`;

  it('parses feat commit', () => {
    const entries = parseConventionalCommits(log);
    expect(entries.some((e) => e.type === 'feat' && e.scope === 'core')).toBe(true);
  });

  it('parses fix commit', () => {
    const entries = parseConventionalCommits(log);
    expect(entries.some((e) => e.type === 'fix')).toBe(true);
  });

  it('skips non-conventional lines', () => {
    const entries = parseConventionalCommits(log);
    expect(entries).toHaveLength(2);
  });
});

describe('docs-gen — renderChangelogSection', () => {
  it('renders a markdown section', () => {
    const entries = [{ hash: 'abc1234', type: 'feat', scope: 'core', message: 'add skill registry' }];
    const section = renderChangelogSection(entries, '1.0.0');
    expect(section).toContain('## [1.0.0]');
    expect(section).toContain('✨ Features');
  });

  it('handles empty entries', () => {
    expect(renderChangelogSection([], 'next')).toContain('No conventional commits found');
  });
});

describe('docs-gen — skill execute (jsdoc mode, no files)', () => {
  it('returns success', async () => {
    const ctx = {
      projectRoot: '/tmp',
      files: [],
      graph: { mode: 'jsdoc' },
      session: null,
      git: null,
    };
    const result = await docsGenSkill.execute(ctx);
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// refactor
// ──────────────────────────────────────────────────────────────────────────
import { detectSmells, refactorSkill } from './refactor.js';
import type { RefactorResult } from './refactor.js';

describe('refactor — detectSmells: large file', () => {
  it('reports large-file smell when lines > 300', () => {
    const src = Array.from({ length: 310 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const smells = detectSmells(src, 'big.ts');
    expect(smells.some((s) => s.kind === 'large-file')).toBe(true);
  });

  it('does NOT report large-file for small file', () => {
    const smells = detectSmells('const x = 1;\n', 'small.ts');
    expect(smells.some((s) => s.kind === 'large-file')).toBe(false);
  });
});

describe('refactor — detectSmells: magic numbers', () => {
  it('detects magic number', () => {
    const smells = detectSmells('const timeout = 3000;\n', 'a.ts');
    expect(smells.some((s) => s.kind === 'magic-number')).toBe(true);
  });

  it('does not flag 0 or 1', () => {
    const smells = detectSmells('const x = 0;\nconst y = 1;\n', 'b.ts');
    expect(smells.filter((s) => s.kind === 'magic-number')).toHaveLength(0);
  });
});

describe('refactor — detectSmells: todo comment', () => {
  it('detects TODO', () => {
    const smells = detectSmells('// TODO: fix this\n', 'a.ts');
    expect(smells.some((s) => s.kind === 'todo-comment')).toBe(true);
  });

  it('detects FIXME', () => {
    const smells = detectSmells('// FIXME: urgent\n', 'a.ts');
    expect(smells.some((s) => s.kind === 'todo-comment')).toBe(true);
  });
});

describe('refactor — detectSmells: duplicate import', () => {
  it('detects a repeated module import', () => {
    const src = `import { a } from 'lodash';\nimport { b } from 'lodash';\n`;
    const smells = detectSmells(src, 'a.ts');
    expect(smells.some((s) => s.kind === 'duplicate-import')).toBe(true);
  });
});

describe('refactor — skill execute (no ts files)', () => {
  it('returns success with 0 smells and 0 filesAnalyzed', async () => {
    const ctx = { projectRoot: '/tmp', files: [], graph: null, session: null, git: null };
    const result = await refactorSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as RefactorResult;
    expect(data.filesAnalyzed).toBe(0);
    expect(data.smells).toHaveLength(0);
  });
});
