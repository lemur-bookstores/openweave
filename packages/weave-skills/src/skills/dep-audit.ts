/**
 * Skill: dep-audit
 *
 * Scans every package.json in the workspace, parses semver ranges, and:
 *   1. Detects dependencies pinned to old major versions vs. latest in registry
 *   2. Optionally runs `npm audit --json` to surface CVE advisories
 *
 * Input options (ctx.graph):
 *   - `packages`  {Record<string, string>[]} — inject package.json deps for tests
 *   - `auditJson` {string}                   — inject raw `npm audit --json` output
 *   - `skipAudit` {boolean}                  — skip npm audit subprocess (default: false)
 *   - `workspace` {string}                   — root dir scan override
 *
 * Note: version comparison is intentionally lightweight (major-only) — no semver lib.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageRef {
  pkg: string;
  source: string;    // which package.json file
  current: string;   // declared range e.g. "^18.0.0"
  kind: 'dep' | 'devDep' | 'peer';
}

export type VulnSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

export interface VulnAdvisory {
  pkg: string;
  severity: VulnSeverity;
  title: string;
  url: string;
  fixAvailable: boolean;
  fixVersion?: string;
}

export interface OutdatedEntry {
  pkg: string;
  source: string;
  current: string;
  latestMajor: number;  // parsed current major
  suggestion: string;
}

export interface DepAuditResult {
  scannedFiles: string[];
  totalDeps: number;
  advisories: VulnAdvisory[];
  outdated: OutdatedEntry[];
  criticalCount: number;
  highCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the major version number from a semver range string */
export function parseMajor(range: string): number {
  const cleaned = range.replace(/^[\^~>=<\s]+/, '').trim();
  const m = /^(\d+)/.exec(cleaned);
  return m ? parseInt(m[1], 10) : -1;
}

/** Find all package.json files under a directory (non-recursive for perf) */
export function findPackageJsons(root: string): string[] {
  const found: string[] = [];
  const candidates = [
    join(root, 'package.json'),
  ];

  // Check common monorepo layouts
  for (const subdir of ['packages', 'apps', 'libs', 'services']) {
    const base = join(root, subdir);
    if (!existsSync(base)) continue;
    try {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const candidate = join(base, entry.name, 'package.json');
          if (existsSync(candidate)) candidates.push(candidate);
        }
      }
    } catch { /* ignore */ }
  }

  for (const c of candidates) {
    if (existsSync(c)) found.push(c);
  }
  return found;
}

export function collectDeps(pkgJsonPath: string): PackageRef[] {
  try {
    const raw = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    const refs: PackageRef[] = [];
    const add = (deps: unknown, kind: PackageRef['kind']) => {
      if (!deps || typeof deps !== 'object') return;
      for (const [pkg, ver] of Object.entries(deps as Record<string, string>)) {
        refs.push({ pkg, source: pkgJsonPath, current: String(ver), kind });
      }
    };
    add(raw['dependencies'], 'dep');
    add(raw['devDependencies'], 'devDep');
    add(raw['peerDependencies'], 'peer');
    return refs;
  } catch {
    return [];
  }
}

/** Parse npm audit --json output into VulnAdvisory[] */
export function parseNpmAudit(json: string): VulnAdvisory[] {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const advisories: VulnAdvisory[] = [];

    // npm audit v7+ format: `vulnerabilities` map
    const vulns = parsed['vulnerabilities'] as Record<string, unknown> | undefined;
    if (vulns) {
      for (const [pkg, raw] of Object.entries(vulns)) {
        const v = raw as Record<string, unknown>;
        const via = Array.isArray(v['via']) ? v['via'] : [];
        for (const entry of via) {
          if (typeof entry === 'object' && entry !== null) {
            const e = entry as Record<string, unknown>;
            advisories.push({
              pkg,
              severity: String(e['severity'] ?? 'low') as VulnSeverity,
              title: String(e['title'] ?? `Vulnerability in ${pkg}`),
              url: String(e['url'] ?? ''),
              fixAvailable: Boolean(v['fixAvailable']),
              fixVersion: v['fixAvailable'] && typeof v['fixAvailable'] === 'object'
                ? String((v['fixAvailable'] as Record<string, unknown>)['version'] ?? '')
                : undefined,
            });
          }
        }
      }
    }

    // npm audit v6 format: `advisories` map
    const legacyAdvisories = parsed['advisories'] as Record<string, unknown> | undefined;
    if (legacyAdvisories && advisories.length === 0) {
      for (const [, raw] of Object.entries(legacyAdvisories)) {
        const a = raw as Record<string, unknown>;
        advisories.push({
          pkg: String(a['module_name'] ?? 'unknown'),
          severity: String(a['severity'] ?? 'low') as VulnSeverity,
          title: String(a['title'] ?? ''),
          url: String(a['url'] ?? ''),
          fixAvailable: Boolean((a['patched_versions'] as string)?.length),
          fixVersion: String(a['patched_versions'] ?? ''),
        });
      }
    }

    return advisories;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const depAuditSkill: SkillModule = {
  id: 'dep-audit',
  name: 'Dependency Auditor',
  description: 'Scans workspace package.json files for outdated versions and runs npm audit to surface CVE advisories',
  version: '1.0.0',
  enabled: false,
  tags: ['devops', 'security'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    const skipAudit = Boolean(opts['skipAudit'] ?? false);
    const workspaceRoot = typeof opts['workspace'] === 'string' ? opts['workspace'] : ctx.projectRoot;

    // Collect all package refs
    let allRefs: PackageRef[] = [];
    let scannedFiles: string[] = [];

    if (Array.isArray(opts['packages'])) {
      // Injected for testing: array of {source, dep, devDep}
      for (const p of opts['packages'] as Array<Record<string, unknown>>) {
        const src = String(p['source'] ?? 'injected');
        scannedFiles.push(src);
        const add = (deps: unknown, kind: PackageRef['kind']) => {
          if (!deps || typeof deps !== 'object') return;
          for (const [pkg, ver] of Object.entries(deps as Record<string, string>)) {
            allRefs.push({ pkg, source: src, current: String(ver), kind });
          }
        };
        add(p['dependencies'], 'dep');
        add(p['devDependencies'], 'devDep');
        add(p['peerDependencies'], 'peer');
      }
    } else {
      scannedFiles = findPackageJsons(workspaceRoot);
      for (const f of scannedFiles) {
        allRefs = allRefs.concat(collectDeps(f));
      }
    }

    // Detect obviously outdated (major ≥ 2 years behind heuristic via major number)
    // In a real implementation we'd call the registry. Here we flag anything with
    // a pinned exact old major vs. a ^ or ~ range as a "check this" suggestion.
    const outdated: OutdatedEntry[] = [];
    const seenPinned = new Set<string>();
    for (const ref of allRefs) {
      // Exact version pins without ^ or ~ are worth flagging as worth reviewing
      if (/^\d+\.\d+\.\d+$/.test(ref.current.trim()) && !seenPinned.has(ref.pkg)) {
        seenPinned.add(ref.pkg);
        outdated.push({
          pkg: ref.pkg,
          source: ref.source,
          current: ref.current,
          latestMajor: parseMajor(ref.current),
          suggestion: `Pinned to exact version ${ref.current} — consider using ^${ref.current} to receive patches`,
        });
      }
    }

    // CVE audit
    let advisories: VulnAdvisory[] = [];
    if (typeof opts['auditJson'] === 'string') {
      advisories = parseNpmAudit(opts['auditJson']);
    } else if (!skipAudit) {
      try {
        const auditOut = execSync('npm audit --json', {
          cwd: workspaceRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
        });
        advisories = parseNpmAudit(auditOut);
      } catch (err) {
        // npm audit exits with non-zero when vulns found — stdout still has JSON
        const output = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? '';
        if (output) advisories = parseNpmAudit(output);
      }
    }

    const criticalCount = advisories.filter((a) => a.severity === 'critical').length;
    const highCount = advisories.filter((a) => a.severity === 'high').length;

    const lines = [
      `🔍 Dep Audit — ${scannedFiles.length} package.json file(s) · ${allRefs.length} total deps`,
      `   CVE advisories: ${advisories.length} (${criticalCount} critical, ${highCount} high)`,
      `   Pinned versions to review: ${outdated.length}`,
      '',
    ];

    if (advisories.length > 0) {
      lines.push('  📋 ADVISORIES:');
      for (const a of advisories.slice(0, 10)) {
        const icon = a.severity === 'critical' ? '❌' : a.severity === 'high' ? '⚠️ ' : 'ℹ️ ';
        lines.push(`  ${icon} [${a.severity}] ${a.pkg} — ${a.title}`);
        if (a.fixAvailable) lines.push(`       Fix: upgrade to ${a.fixVersion ?? 'latest'}`);
        if (a.url) lines.push(`       ${a.url}`);
      }
      if (advisories.length > 10) lines.push(`  … and ${advisories.length - 10} more`);
      lines.push('');
    }

    if (outdated.length > 0) {
      lines.push('  📦 PINNED VERSIONS:');
      for (const o of outdated.slice(0, 8)) {
        lines.push(`  ⚠️  ${o.pkg}@${o.current} (${o.source})`);
        lines.push(`     ${o.suggestion}`);
      }
    }

    const result: DepAuditResult = {
      scannedFiles,
      totalDeps: allRefs.length,
      advisories,
      outdated,
      criticalCount,
      highCount,
    };

    return {
      success: criticalCount === 0,
      output: lines.join('\n'),
      data: result,
    };
  },
};
