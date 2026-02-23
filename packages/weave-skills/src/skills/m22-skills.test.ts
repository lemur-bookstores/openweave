/**
 * M22 · Developer Experience Skills — Unit Tests
 *
 * Coverage:
 *   - onboarding        (10 tests)
 *   - commit-composer   (12 tests)
 *   - context-memory    (10 tests)
 *   - multi-repo        (10 tests)
 *   - cli-interactive   (12 tests)
 *
 * Total: 54 tests
 *
 * All I/O is injected via ctx.graph — no real FS/git/network calls.
 */

import { describe, it, expect } from 'vitest';

// onboarding
import {
  buildTreeNodes,
  extractStartupCommands,
  buildDataFlow,
  renderMarkdown,
  renderText,
  onboardingSkill,
} from './onboarding.js';

// commit-composer
import {
  parseDiffStats,
  detectScope,
  detectType,
  detectBreakingChange,
  commitComposerSkill,
} from './commit-composer.js';

// context-memory
import {
  generateId,
  matchesQuery,
  saveEntry,
  listEntries,
  contextMemorySkill,
  type MemoryEntry,
} from './context-memory.js';

// multi-repo
import {
  findCrossRepoDeps,
  buildSummary,
  multiRepoSkill,
  type RepoInfo,
} from './multi-repo.js';

// cli-interactive
import {
  buildHelpText,
  buildWelcomeMessage,
  parseCommand,
  dispatchCommand,
  REPL_COMMANDS,
  cliInteractiveSkill,
  type ReplConfig,
} from './cli-interactive.js';

import type { SkillContext } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(graph: Record<string, unknown> = {}): SkillContext {
  return {
    projectRoot: '/fake/project',
    files: [],
    graph,
    session: { id: 'test-session' },
    git: null,
  };
}

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,8 @@
+export function addFeature() {
+  return 42;
+}
+
 export function existing() {
   return 'hello';
 }
`;

const BREAKING_DIFF = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,3 +0,3 @@
-export function oldApi(param: string) {
-  return param;
-}
`;

// ---------------------------------------------------------------------------
// onboarding
// ---------------------------------------------------------------------------

describe('onboarding', () => {
  it('buildTreeNodes returns sorted nodes with annotations', () => {
    const files = ['src/index.ts', 'package.json', 'docs/README.md', 'src/types.ts'];
    const nodes = buildTreeNodes(files);
    // dirs before files
    expect(nodes[0].isDir).toBe(true);
    const names = nodes.map((n) => n.name);
    expect(names).toContain('src');
    expect(names).toContain('package.json');
  });

  it('buildTreeNodes annotates known dirs', () => {
    const files = ['packages/weave-graph/index.ts', 'apps/weave-cli/cli.ts'];
    const nodes = buildTreeNodes(files);
    const pkgs = nodes.find((n) => n.name === 'packages');
    expect(pkgs?.annotation).toContain('Workspace');
  });

  it('extractStartupCommands maps known npm scripts', () => {
    const scripts = { dev: 'vite', build: 'tsc', custom: 'echo hi' };
    const cmds = extractStartupCommands(scripts);
    expect(cmds.length).toBe(2);
    expect(cmds.map((c) => c.name)).toContain('dev');
    expect(cmds.every((c) => c.command.startsWith('pnpm'))).toBe(true);
  });

  it('buildDataFlow detects components from file list', () => {
    const files = ['packages/agent-core/index.ts', 'packages/weave-link/mcp-server.ts'];
    const flow = buildDataFlow(files);
    expect(flow.some((l) => l.includes('AgentCore'))).toBe(true);
    expect(flow.some((l) => l.includes('WeaveLink'))).toBe(true);
  });

  it('renderMarkdown produces markdown with headers', () => {
    const nodes = buildTreeNodes(['src/index.ts', 'package.json']);
    const report = {
      projectName: 'TestProject',
      description: 'A test',
      tree: nodes,
      dataFlow: ['Step 1', 'Step 2'],
      startupCommands: [{ name: 'dev', command: 'pnpm dev', description: 'Start dev server' }],
      faq: [{ q: 'How?', a: 'Like this.' }],
      format: 'markdown' as const,
    };
    const md = renderMarkdown(report);
    expect(md).toContain('# 👋 Welcome to **TestProject**');
    expect(md).toContain('## 📁 Project Structure');
    expect(md).toContain('## ❓ FAQ');
  });

  it('renderText produces plain text output without markdown', () => {
    const report = {
      projectName: 'MyApp',
      description: 'Plain text test',
      tree: [],
      dataFlow: ['A → B'],
      startupCommands: [],
      faq: [],
      format: 'text' as const,
    };
    const text = renderText(report);
    expect(text).toContain('Welcome to MyApp');
    expect(text).not.toContain('#');
  });

  it('skill runs with injected pkgJson and fileTree', async () => {
    const ctx = makeCtx({
      pkgJson: { name: 'my-app', description: 'My application', scripts: { dev: 'vite', build: 'tsc' } },
      fileTree: ['src/index.ts', 'package.json', 'packages/weave-graph/index.ts'],
      format: 'markdown',
    });
    const result = await onboardingSkill.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('my-app');
    const data = result.data as { report: { startupCommands: unknown[] }; rendered: string };
    expect(data.report.startupCommands.length).toBeGreaterThan(0);
    expect(data.rendered).toContain('# 👋 Welcome to');
  });

  it('skill defaults to text format when requested', async () => {
    const ctx = makeCtx({
      pkgJson: { name: 'cli-app', description: 'CLI tool', scripts: {} },
      fileTree: ['src/cli.ts'],
      format: 'text',
    });
    const result = await onboardingSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { rendered: string };
    expect(data.rendered).toContain('Welcome to cli-app');
  });

  it('skill falls back gracefully with no files or package', async () => {
    const ctx = makeCtx({});
    // no pkgJson, no fileTree — uses ctx.files which is []
    const result = await onboardingSkill.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeTruthy();
  });

  it('skill includes default FAQ questions', async () => {
    const ctx = makeCtx({
      pkgJson: { name: 'demo', description: 'demo', scripts: {} },
      fileTree: [],
    });
    const result = await onboardingSkill.execute(ctx);
    const data = result.data as { report: { faq: unknown[] } };
    expect(data.report.faq.length).toBeGreaterThan(0);
  });

  it('DEV_EXPERIENCE_SKILLS array includes onboardingSkill', async () => {
    const { DEV_EXPERIENCE_SKILLS } = await import('../skills/index.js');
    expect(DEV_EXPERIENCE_SKILLS.map((s) => s.id)).toContain('onboarding');
  });
});

// ---------------------------------------------------------------------------
// commit-composer
// ---------------------------------------------------------------------------

describe('commit-composer', () => {
  it('parseDiffStats counts additions and deletions', () => {
    const stats = parseDiffStats(SAMPLE_DIFF);
    expect(stats.additions).toBeGreaterThan(0);
    expect(stats.filesChanged).toContain('src/foo.ts');
  });

  it('parseDiffStats ignores +++ and --- header lines', () => {
    const diff = `--- a/foo.ts\n+++ b/foo.ts\n+added line\n-removed line`;
    const stats = parseDiffStats(diff);
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(1);
  });

  it('detectScope returns package name from path', () => {
    expect(detectScope(['packages/weave-graph/src/index.ts'])).toBe('graph');
    expect(detectScope(['apps/weave-cli/cli.ts'])).toBe('cli');
    expect(detectScope([])).toBeNull();
  });

  it('detectType returns test for .test.ts files', () => {
    expect(detectType(['src/foo.test.ts'], '')).toBe('test');
    expect(detectType(['src/foo.spec.ts'], '')).toBe('test');
  });

  it('detectType returns docs for .md files', () => {
    expect(detectType(['README.md', 'CONTRIBUTING.md'], '')).toBe('docs');
  });

  it('detectType returns ci for .github files', () => {
    expect(detectType(['.github/workflows/ci.yml'], '')).toBe('ci');
  });

  it('detectType returns feat when export is added in diff', () => {
    const type = detectType(['src/new-feature.ts'], SAMPLE_DIFF);
    expect(type).toBe('feat');
  });

  it('detectBreakingChange detects removed export', () => {
    const { breaking, note } = detectBreakingChange(BREAKING_DIFF);
    expect(breaking).toBe(true);
    expect(note).toBeTruthy();
  });

  it('detectBreakingChange returns false for non-breaking diff', () => {
    const { breaking } = detectBreakingChange(SAMPLE_DIFF);
    expect(breaking).toBe(false);
  });

  it('skill composes a conventional commit from injected diff', async () => {
    const ctx = makeCtx({
      diff: SAMPLE_DIFF,
      stagedFiles: ['packages/weave-graph/src/foo.ts'],
    });
    const result = await commitComposerSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { suggestedMessage: string; scope: string | null };
    expect(data.suggestedMessage).toMatch(/^(feat|fix|chore|refactor|perf)/);
    expect(data.scope).toBe('graph');
  });

  it('skill returns error for empty diff', async () => {
    const ctx = makeCtx({ diff: '' });
    const result = await commitComposerSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('empty diff');
  });

  it('skill marks breaking change in message', async () => {
    const ctx = makeCtx({
      diff: BREAKING_DIFF,
      stagedFiles: ['src/api.ts'],
    });
    const result = await commitComposerSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { breakingChange: boolean; suggestedMessage: string };
    expect(data.breakingChange).toBe(true);
    expect(data.suggestedMessage).toContain('BREAKING CHANGE');
  });
});

// ---------------------------------------------------------------------------
// context-memory
// ---------------------------------------------------------------------------

describe('context-memory', () => {
  it('generateId produces deterministic slug-based id', () => {
    const id = generateId({
      type: 'decision',
      title: 'Use SQLite provider',
      content: 'content',
      tags: [],
      createdAt: '2026-02-23T12:00:00.000Z',
    });
    expect(id).toMatch(/^mem-decision-use-sqlite-provider/);
  });

  it('matchesQuery matches title, content and tags', () => {
    const entry: MemoryEntry = {
      id: 'e1',
      type: 'decision',
      title: 'Use pnpm workspaces',
      content: 'We decided to use pnpm workspaces for package management',
      tags: ['tooling', 'monorepo'],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(matchesQuery(entry, 'pnpm')).toBe(true);
    expect(matchesQuery(entry, 'monorepo')).toBe(true);
    expect(matchesQuery(entry, 'react')).toBe(false);
  });

  it('saveEntry creates and stores an entry with auto-id', () => {
    const store = new Map<string, MemoryEntry>();
    const entry = saveEntry(store, { type: 'decision', title: 'Test', content: 'body' });
    expect(entry.id).toMatch(/^mem-decision-test/);
    expect(store.has(entry.id)).toBe(true);
  });

  it('listEntries filters by type', () => {
    const store = new Map<string, MemoryEntry>();
    saveEntry(store, { type: 'decision', title: 'D1', content: 'x' });
    saveEntry(store, { type: 'agreement', title: 'A1', content: 'y' });
    const decisions = listEntries(store, undefined, 'decision');
    expect(decisions.every((e) => e.type === 'decision')).toBe(true);
    expect(decisions.length).toBe(1);
  });

  it('skill save action stores entry and returns it', async () => {
    const store = new Map<string, MemoryEntry>();
    const ctx = makeCtx({
      action: 'save',
      entry: { type: 'agreement', title: 'No force push', content: 'Team agreed: no force-push to main.' },
      store,
    });
    const result = await contextMemorySkill.execute(ctx);
    expect(result.success).toBe(true);
    expect(store.size).toBe(1);
    expect(result.output).toContain('No force push');
  });

  it('skill save action requires entry', async () => {
    const ctx = makeCtx({ action: 'save' });
    const result = await contextMemorySkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('missing entry');
  });

  it('skill load action returns matching entries from injected store', async () => {
    const store = new Map<string, MemoryEntry>();
    saveEntry(store, { type: 'decision', title: 'Auth strategy', content: 'Use JWT' });
    saveEntry(store, { type: 'note', title: 'DB choice', content: 'SQLite for local' });
    const ctx = makeCtx({ action: 'load', query: 'JWT', store });
    const result = await contextMemorySkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { entries: MemoryEntry[] };
    expect(data.entries.length).toBe(1);
    expect(data.entries[0].title).toBe('Auth strategy');
  });

  it('skill list action returns all entries', async () => {
    const store = new Map<string, MemoryEntry>();
    saveEntry(store, { type: 'decision', title: 'A', content: 'x' });
    saveEntry(store, { type: 'note', title: 'B', content: 'y' });
    const ctx = makeCtx({ action: 'list', store });
    const result = await contextMemorySkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { entries: MemoryEntry[] };
    expect(data.entries.length).toBe(2);
  });

  it('skill defaults to list action', async () => {
    const store = new Map<string, MemoryEntry>();
    const ctx = makeCtx({ store });
    const result = await contextMemorySkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { action: string };
    expect(data.action).toBe('list');
  });
});

// ---------------------------------------------------------------------------
// multi-repo
// ---------------------------------------------------------------------------

const REPO_A: RepoInfo = {
  root: '/repos/app-a',
  name: 'app-a',
  description: 'Service A',
  version: '1.0.0',
  dependencies: [
    { name: 'express', version: '^4.18.0', kind: 'dep' },
    { name: 'typescript', version: '^5.0.0', kind: 'devDep' },
  ],
  fileCount: 42,
  topLevelEntries: ['src', 'package.json'],
  hasTypeScript: true,
  hasTests: true,
};

const REPO_B: RepoInfo = {
  root: '/repos/app-b',
  name: 'app-b',
  description: 'Service B',
  version: '2.0.0',
  dependencies: [
    { name: 'express', version: '^4.19.0', kind: 'dep' }, // version conflict
    { name: 'lodash', version: '^4.17.0', kind: 'dep' },
    { name: 'typescript', version: '^5.0.0', kind: 'devDep' },
  ],
  fileCount: 18,
  topLevelEntries: ['src', 'tests', 'package.json'],
  hasTypeScript: true,
  hasTests: true,
};

describe('multi-repo', () => {
  it('findCrossRepoDeps identifies shared dependencies', () => {
    const crossDeps = findCrossRepoDeps([REPO_A, REPO_B]);
    const depNames = crossDeps.map((d) => d.dep);
    expect(depNames).toContain('express');
    expect(depNames).toContain('typescript');
  });

  it('findCrossRepoDeps flags version conflicts', () => {
    const crossDeps = findCrossRepoDeps([REPO_A, REPO_B]);
    const express = crossDeps.find((d) => d.dep === 'express');
    expect(express?.versionConflict).toBe(true);
  });

  it('findCrossRepoDeps excludes single-repo deps', () => {
    const crossDeps = findCrossRepoDeps([REPO_A, REPO_B]);
    const lodash = crossDeps.find((d) => d.dep === 'lodash');
    expect(lodash).toBeUndefined();
  });

  it('buildSummary lists repos and conflict counts', () => {
    const crossDeps = findCrossRepoDeps([REPO_A, REPO_B]);
    const summary = buildSummary([REPO_A, REPO_B], crossDeps);
    expect(summary).toContain('2 repositor');
    expect(summary).toContain('app-a');
    expect(summary).toContain('app-b');
  });

  it('skill runs with injected repoData', async () => {
    const ctx = makeCtx({ repoData: [REPO_A, REPO_B], mode: 'summary' });
    const result = await multiRepoSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { repos: RepoInfo[]; crossDeps: unknown[] };
    expect(data.repos.length).toBe(2);
    expect(data.crossDeps.length).toBeGreaterThan(0);
  });

  it('skill mode=deps returns cross-deps', async () => {
    const ctx = makeCtx({ repoData: [REPO_A, REPO_B], mode: 'deps' });
    const result = await multiRepoSkill.execute(ctx);
    expect(result.success).toBe(true);
    const data = result.data as { mode: string; crossDeps: unknown[] };
    expect(data.mode).toBe('deps');
    expect(data.crossDeps.length).toBeGreaterThan(0);
  });

  it('skill mode=files clears crossDeps', async () => {
    const ctx = makeCtx({ repoData: [REPO_A, REPO_B], mode: 'files' });
    const result = await multiRepoSkill.execute(ctx);
    const data = result.data as { crossDeps: unknown[] };
    expect(data.crossDeps.length).toBe(0);
  });

  it('skill with no repos still succeeds (uses projectRoot)', async () => {
    const ctx = makeCtx({ repoData: [REPO_A] });
    const result = await multiRepoSkill.execute(ctx);
    expect(result.success).toBe(true);
  });

  it('findCrossRepoDeps sorts conflicts first', () => {
    const crossDeps = findCrossRepoDeps([REPO_A, REPO_B]);
    // conflicts should come first
    const firstConflict = crossDeps[0].versionConflict;
    expect(firstConflict).toBe(true);
  });

  it('skill reports conflict summary in output', async () => {
    const ctx = makeCtx({ repoData: [REPO_A, REPO_B] });
    const result = await multiRepoSkill.execute(ctx);
    expect(result.output).toContain('repositor');
  });
});

// ---------------------------------------------------------------------------
// cli-interactive
// ---------------------------------------------------------------------------

function makeReplConfig(activeSkills: string[] = []): ReplConfig {
  return {
    sessionId: 'test-123',
    prompt: 'weave> ',
    historyFile: '.weave/.repl_history',
    maxHistory: 500,
    activeSkills,
    commands: REPL_COMMANDS,
  };
}

describe('cli-interactive', () => {
  it('buildHelpText includes all command names', () => {
    const text = buildHelpText(REPL_COMMANDS, []);
    for (const cmd of REPL_COMMANDS) {
      expect(text).toContain(cmd.name);
    }
  });

  it('buildHelpText lists active skills', () => {
    const text = buildHelpText(REPL_COMMANDS, ['code-review', 'auto-fix']);
    expect(text).toContain('code-review');
    expect(text).toContain('auto-fix');
  });

  it('buildWelcomeMessage includes session id', () => {
    const msg = buildWelcomeMessage('sess-42');
    expect(msg).toContain('sess-42');
  });

  it('parseCommand splits command and args', () => {
    expect(parseCommand('run auto-fix --dry')).toEqual({ name: 'run', args: ['auto-fix', '--dry'] });
    expect(parseCommand('  help  ')).toEqual({ name: 'help', args: [] });
  });

  it('dispatchCommand resolves aliases', () => {
    const result = dispatchCommand({ name: '?', args: [] }, makeReplConfig(), []);
    expect(result.type).toBe('info');
    expect(result.output).toContain('help');
  });

  it('dispatchCommand returns error for unknown command', () => {
    const result = dispatchCommand({ name: 'unknown-cmd', args: [] }, makeReplConfig(), []);
    expect(result.type).toBe('error');
  });

  it('dispatchCommand help with sub-command shows usage', () => {
    const result = dispatchCommand({ name: 'help', args: ['run'] }, makeReplConfig(), []);
    expect(result.output).toContain('Usage:');
  });

  it('dispatchCommand skills lists active skills', () => {
    const result = dispatchCommand({ name: 'skills', args: [] }, makeReplConfig(['auto-fix']), []);
    expect(result.output).toContain('auto-fix');
  });

  it('dispatchCommand run returns error if skill not active', () => {
    const result = dispatchCommand({ name: 'run', args: ['code-review'] }, makeReplConfig([]), []);
    expect(result.type).toBe('error');
    expect(result.output).toContain('"code-review" is not active');
  });

  it('dispatchCommand run dispatches active skill', () => {
    const result = dispatchCommand(
      { name: 'run', args: ['auto-fix'] },
      makeReplConfig(['auto-fix']),
      [],
    );
    expect(result.type).toBe('skill');
  });

  it('skill returns welcome message with no command', async () => {
    const ctx = makeCtx({ sessionId: 'my-sess', skills: ['auto-fix', 'code-review'] });
    const result = await cliInteractiveSkill.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('my-sess');
  });

  it('skill dispatches injected command', async () => {
    const ctx = makeCtx({
      command: 'skills',
      skills: ['auto-fix'],
      sessionId: 'sess-test',
    });
    const result = await cliInteractiveSkill.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('auto-fix');
  });

  it('skill returns success:false for unknown command', async () => {
    const ctx = makeCtx({ command: 'blah', skills: [] });
    const result = await cliInteractiveSkill.execute(ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown command');
  });
});
