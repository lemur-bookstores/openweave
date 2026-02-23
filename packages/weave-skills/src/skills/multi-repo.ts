/**
 * Skill: multi-repo
 *
 * Allows reasoning across multiple repositories simultaneously.
 * Aggregates file lists, package manifests and git status from each configured
 * repo root and produces a unified cross-repo analysis report.
 *
 * Input (via SkillContext.graph):
 *   - `ctx.graph['repos']`   — string[] — absolute paths to additional repo roots
 *   - `ctx.graph['repoData']` — RepoInfo[] — injectable repo snapshots for tests (bypasses FS)
 *   - `ctx.graph['mode']`    — 'summary' | 'deps' | 'files' (default: 'summary')
 *
 * Output data:
 *   - MultiRepoResult
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoDependency {
  name: string;
  version: string;
  kind: 'dep' | 'devDep' | 'peer';
}

export interface RepoInfo {
  root: string;
  name: string;
  description: string;
  version: string;
  dependencies: RepoDependency[];
  fileCount: number;
  topLevelEntries: string[];
  hasTypeScript: boolean;
  hasTests: boolean;
  branch?: string;
}

export interface CrossRepoDependency {
  dep: string;
  repos: string[];
  versions: string[];
  versionConflict: boolean;
}

export interface MultiRepoResult {
  mode: 'summary' | 'deps' | 'files';
  repos: RepoInfo[];
  crossDeps: CrossRepoDependency[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function scanRepoRoot(root: string): RepoInfo {
  const name = basename(root);
  let description = '';
  let version = '0.0.0';
  const dependencies: RepoDependency[] = [];

  // Read package.json
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      description = (pkg['description'] as string) ?? '';
      version = (pkg['version'] as string) ?? '0.0.0';

      const addDeps = (obj: Record<string, string> | undefined, kind: RepoDependency['kind']) => {
        if (!obj) return;
        for (const [dep, ver] of Object.entries(obj)) {
          dependencies.push({ name: dep, version: ver, kind });
        }
      };
      addDeps(pkg['dependencies'] as Record<string, string>, 'dep');
      addDeps(pkg['devDependencies'] as Record<string, string>, 'devDep');
      addDeps(pkg['peerDependencies'] as Record<string, string>, 'peer');
    } catch {
      // ignore
    }
  }

  // Top-level entries
  let topLevelEntries: string[] = [];
  let fileCount = 0;
  try {
    topLevelEntries = readdirSync(root).filter(
      (e) => !e.startsWith('.') && e !== 'node_modules',
    );
    // Count files recursively (limited scan)
    fileCount = countFiles(root, 0, 3);
  } catch {
    // ignore FS errors
  }

  const hasTypeScript = existsSync(join(root, 'tsconfig.json'));
  const hasTests =
    existsSync(join(root, 'tests')) ||
    existsSync(join(root, '__tests__')) ||
    topLevelEntries.some((e) => e.endsWith('.test.ts') || e.endsWith('.spec.ts'));

  return {
    root,
    name,
    description,
    version,
    dependencies,
    fileCount,
    topLevelEntries,
    hasTypeScript,
    hasTests,
  };
}

function countFiles(dir: string, depth: number, maxDepth: number): number {
  if (depth > maxDepth) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      if (e.isDirectory()) {
        count += countFiles(join(dir, e.name), depth + 1, maxDepth);
      } else {
        count++;
      }
    }
  } catch {
    // ignore
  }
  return count;
}

export function findCrossRepoDeps(repos: RepoInfo[]): CrossRepoDependency[] {
  // Map dep → { repo, version }[]
  const map = new Map<string, Array<{ repo: string; version: string }>>();

  for (const repo of repos) {
    for (const dep of repo.dependencies) {
      const arr = map.get(dep.name) ?? [];
      arr.push({ repo: repo.name, version: dep.version });
      map.set(dep.name, arr);
    }
  }

  // Only return deps that appear in ≥2 repos
  const crossDeps: CrossRepoDependency[] = [];
  for (const [dep, entries] of map) {
    if (entries.length < 2) continue;
    const repos = entries.map((e) => e.repo);
    const versions = [...new Set(entries.map((e) => e.version))];
    crossDeps.push({
      dep,
      repos,
      versions,
      versionConflict: versions.length > 1,
    });
  }

  return crossDeps.sort((a, b) => {
    if (a.versionConflict !== b.versionConflict) return a.versionConflict ? -1 : 1;
    return b.repos.length - a.repos.length;
  });
}

export function buildSummary(repos: RepoInfo[], crossDeps: CrossRepoDependency[]): string {
  const conflicts = crossDeps.filter((d) => d.versionConflict).length;
  const lines = [
    `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} analysed`,
    `${crossDeps.length} shared dependencies (${conflicts} version conflict${conflicts === 1 ? '' : 's'})`,
    ...repos.map((r) => `  • ${r.name} v${r.version} — ${r.fileCount} files`),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const multiRepoSkill: SkillModule = {
  id: 'multi-repo',
  name: 'Multi-Repo Analyser',
  description:
    'Aggregates file lists, package manifests and dependency graphs across multiple repositories for cross-repo analysis.',
  version: '1.0.0',
  enabled: true,
  tags: ['monorepo', 'dx', 'dependencies', 'analysis'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph ?? {}) as Record<string, unknown>;
    const mode = (opts['mode'] as 'summary' | 'deps' | 'files') ?? 'summary';

    // --- Repo list ---
    let repos: RepoInfo[];

    if (Array.isArray(opts['repoData'])) {
      // Injectable for tests
      repos = opts['repoData'] as RepoInfo[];
    } else {
      const extraRoots = Array.isArray(opts['repos']) ? (opts['repos'] as string[]) : [];
      const allRoots = [ctx.projectRoot, ...extraRoots].filter(Boolean);
      repos = allRoots.map(scanRepoRoot);
    }

    const crossDeps = findCrossRepoDeps(repos);
    const summary = buildSummary(repos, crossDeps);

    const result: MultiRepoResult = {
      mode,
      repos,
      crossDeps: mode === 'files' ? [] : crossDeps,
      summary,
    };

    return {
      success: true,
      output: summary,
      data: result,
    };
  },
};
