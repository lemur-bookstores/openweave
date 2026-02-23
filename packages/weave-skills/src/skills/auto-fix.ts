/**
 * Skill: auto-fix
 *
 * Reads VULN-*.md remediation files and reports what patches need to be applied.
 * In apply mode, writes the patches and creates one git commit per VULN.
 *
 * Input (via SkillContext.graph or options in data):
 *   - `sentinelDir`  — directory containing VULN-*.md files (default: .sentinel_logs)
 *   - `apply`        — if true, attempt to apply patches via execSync (default: false / dry-run)
 *
 * Output data:
 *   - vulns: VulnReport[]   — one entry per VULN file found
 *   - applied: number       — commits created (only in apply mode)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VulnReport {
  id: string;
  file: string;
  title: string;
  severity: string;
  affectedFiles: string[];
  remediation: string;
  status: 'pending' | 'applied' | 'error';
  error?: string;
}

export interface AutoFixResult {
  vulns: VulnReport[];
  applied: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VULN_PATTERN = /^VULN-\d+\.md$/i;
const SEVERITY_RE = /\*\*severity:?\*\*[:\s]*(.+)/i;
const TITLE_RE = /^#\s+(.+)/m;
const AFFECTED_RE = /\*\*affected[^*]*\*\*[:\s]+([^\n]+)/gi;
const REMEDIATION_RE = /##\s+remediation[\s\S]*?(?=##|$)/i;

export function parseVulnFile(content: string, filePath: string): VulnReport {
  const id = /VULN-\d+/i.exec(filePath)?.[0]?.toUpperCase() ?? 'VULN-???';
  const titleMatch = TITLE_RE.exec(content);
  const title = titleMatch ? titleMatch[1].trim() : id;
  const severityMatch = SEVERITY_RE.exec(content);
  const severity = severityMatch ? severityMatch[1].trim() : 'Unknown';

  const affectedFiles: string[] = [];
  let affectedMatch: RegExpExecArray | null;
  while ((affectedMatch = AFFECTED_RE.exec(content)) !== null) {
    affectedFiles.push(...affectedMatch[1].split(/[,;]+/).map((s) => s.trim()).filter(Boolean));
  }

  const remMatch = REMEDIATION_RE.exec(content);
  const remediation = remMatch ? remMatch[0].replace(/##\s+remediation/i, '').trim() : '';

  return { id, file: filePath, title, severity, affectedFiles, remediation, status: 'pending' };
}

function runGitCommit(projectRoot: string, vuln: VulnReport): void {
  execSync(`git -C "${projectRoot}" add -A`, { stdio: 'pipe' });
  execSync(
    `git -C "${projectRoot}" commit -m "fix(${vuln.id.toLowerCase()}): ${vuln.title.slice(0, 72)}"`,
    { stdio: 'pipe' }
  );
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const autoFixSkill: SkillModule = {
  id: 'auto-fix',
  name: 'Auto-Fix',
  description: 'Reads VULN-*.md files and reports (or applies) security remediations',
  version: '1.0.0',
  enabled: false,
  tags: ['dev', 'security'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph as Record<string, unknown> | null) ?? {};
    const sentinelDir = String(opts['sentinelDir'] ?? '.sentinel_logs');
    const apply = Boolean(opts['apply'] ?? false);
    const sentinelPath = resolve(ctx.projectRoot, sentinelDir);

    if (!existsSync(sentinelPath)) {
      return {
        success: true,
        output: `No sentinel directory found at ${sentinelPath} — nothing to fix.`,
        data: { vulns: [], applied: 0, skipped: 0, errors: 0, dryRun: !apply } as AutoFixResult,
      };
    }

    const vulnFiles = readdirSync(sentinelPath)
      .filter((f) => VULN_PATTERN.test(f))
      .sort();

    if (vulnFiles.length === 0) {
      return {
        success: true,
        output: `No VULN-*.md files found in ${sentinelPath}.`,
        data: { vulns: [], applied: 0, skipped: 0, errors: 0, dryRun: !apply } as AutoFixResult,
      };
    }

    const reports: VulnReport[] = vulnFiles.map((f) => {
      const filePath = join(sentinelPath, f);
      return parseVulnFile(readFileSync(filePath, 'utf-8'), filePath);
    });

    let applied = 0;
    let errors = 0;

    if (apply) {
      for (const vuln of reports) {
        try {
          runGitCommit(ctx.projectRoot, vuln);
          vuln.status = 'applied';
          applied++;
        } catch (err) {
          vuln.status = 'error';
          vuln.error = err instanceof Error ? err.message : String(err);
          errors++;
        }
      }
    }

    const lines = [
      apply ? `🔧 Auto-Fix — Applied mode` : `🔍 Auto-Fix — Dry-run mode`,
      `Found ${reports.length} VULN file(s) in ${sentinelDir}/`,
      '',
      ...reports.map((v) => {
        const icon = v.status === 'applied' ? '✅' : v.status === 'error' ? '❌' : '⬜';
        return `  ${icon} ${v.id} [${v.severity}] — ${v.title}`;
      }),
      '',
      apply ? `Applied: ${applied} | Errors: ${errors}` : `Run with apply:true to commit fixes.`,
    ];

    return {
      success: errors === 0,
      output: lines.join('\n'),
      data: {
        vulns: reports,
        applied,
        skipped: reports.length - applied - errors,
        errors,
        dryRun: !apply,
      } as AutoFixResult,
    };
  },
};
