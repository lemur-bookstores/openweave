/**
 * Orphan Rate Evaluator — M11
 *
 * KPI: measures the percentage of code entities that are unused (orphaned).
 *
 * Score = (1 - orphan_rate) × 100
 *   orphan_rate = orphan_count / total_entities
 *
 * Scoring:
 *   PASS  ≥ 80  (≤20% orphans)
 *   WARN  ≥ 60  (≤40% orphans)
 *   FAIL  <  60  (>40% orphans)
 *
 * Severity weighting: CRITICAL orphans count as 3×, HIGH as 2×, rest as 1×.
 */

import { KPIResult, LintReport, LintSeverity } from '../types';

const SEVERITY_WEIGHT: Record<LintSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 1,
};

export interface OrphanRateConfig {
  passThreshold?: number; // default 80
  warnThreshold?: number; // default 60
  /** If true, uses severity-weighted count instead of raw count */
  weightBySeverity?: boolean;
}

export class OrphanRateEvaluator {
  private config: Required<OrphanRateConfig>;

  constructor(config?: OrphanRateConfig) {
    this.config = {
      passThreshold: config?.passThreshold ?? 80,
      warnThreshold: config?.warnThreshold ?? 60,
      weightBySeverity: config?.weightBySeverity ?? true,
    };
  }

  evaluate(report: LintReport): KPIResult {
    const now = new Date().toISOString();

    if (report.totalEntities === 0) {
      return this.build(100, 'No entities found — nothing to evaluate.', [], now);
    }

    const orphanCount = this.config.weightBySeverity
      ? this.weightedCount(report)
      : report.orphans.length;

    const totalWeight = this.config.weightBySeverity
      ? this.weightedTotal(report)
      : report.totalEntities;

    const orphanRate = totalWeight === 0 ? 0 : orphanCount / totalWeight;
    const score = Math.max(0, Math.min(100, (1 - orphanRate) * 100));

    const details = [
      `Total entities: ${report.totalEntities}`,
      `Orphaned: ${report.orphans.length}`,
      `Raw orphan rate: ${((report.orphans.length / report.totalEntities) * 100).toFixed(1)}%`,
    ];

    if (this.config.weightBySeverity) {
      const bySeverity = this.groupBySeverity(report);
      for (const [sev, count] of Object.entries(bySeverity)) {
        if (count > 0) details.push(`  ${sev}: ${count} orphan(s)`);
      }
      details.push(`Weighted orphan rate: ${(orphanRate * 100).toFixed(1)}%`);
    }

    const files = [...new Set(report.orphans.map(o => o.file))];
    if (files.length > 0) {
      details.push(`Affected files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` +${files.length - 5} more` : ''}`);
    }

    const summary = `Orphan rate: ${(orphanRate * 100).toFixed(1)}% — score ${score.toFixed(0)}/100`;
    return this.build(score, summary, details, now);
  }

  private weightedCount(report: LintReport): number {
    return report.orphans.reduce((sum, o) => sum + (SEVERITY_WEIGHT[o.severity] ?? 1), 0);
  }

  private weightedTotal(report: LintReport): number {
    // We only know total entity count, not per-severity breakdown for all entities.
    // Use raw orphan weight vs entity count as a conservative estimate.
    return Math.max(report.totalEntities, this.weightedCount(report));
  }

  private groupBySeverity(report: LintReport): Record<string, number> {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const o of report.orphans) {
      counts[o.severity] = (counts[o.severity] ?? 0) + 1;
    }
    return counts;
  }

  private build(score: number, summary: string, details: string[], now: string): KPIResult {
    const { passThreshold, warnThreshold } = this.config;
    const status = score >= passThreshold ? 'PASS' : score >= warnThreshold ? 'WARN' : 'FAIL';

    return {
      id: 'orphan-rate',
      name: 'Orphan Rate',
      status,
      score: Math.round(score * 10) / 10,
      passThreshold,
      warnThreshold,
      summary,
      details,
      evaluatedAt: now,
    };
  }
}
