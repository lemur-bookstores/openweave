/**
 * Compression Quality Evaluator — M11
 *
 * KPI: measures how well the context compression preserved important nodes
 * (high-frequency) and archived unimportant ones (low-frequency).
 *
 * Methodology:
 *   Given pre + post compression snapshots:
 *   1. Preservation rate   — high-freq nodes (freq > median) still present after compression
 *   2. Archival rate       — low-freq nodes (freq ≤ median) removed after compression
 *   3. No data loss        — no high-freq nodes lost
 *   4. Size reduction      — post graph is smaller than pre (compression did something)
 *
 * Score = weighted combination of the 4 components
 *   preservation: 40pts, archival: 30pts, no-data-loss bonus: 15pts, size-reduction: 15pts
 *
 * Scoring:
 *   PASS  ≥ 75
 *   WARN  ≥ 55
 *   FAIL  <  55
 */

import { KPIResult, CompressionSnapshot, GraphNode } from '../types';

export interface CompressionQualityConfig {
  passThreshold?: number; // default 75
  warnThreshold?: number; // default 55
  /**
   * Optional explicit frequency cutoff to distinguish high/low.
   * If not provided, median frequency is used.
   */
  frequencyCutoff?: number;
}

export class CompressionQualityEvaluator {
  private config: Required<CompressionQualityConfig>;

  constructor(config?: CompressionQualityConfig) {
    this.config = {
      passThreshold: config?.passThreshold ?? 75,
      warnThreshold: config?.warnThreshold ?? 55,
      frequencyCutoff: config?.frequencyCutoff ?? -1, // -1 = use median
    };
  }

  evaluate(snap: CompressionSnapshot): KPIResult {
    const now = new Date().toISOString();
    const details: string[] = [];

    const preNodes = Object.values(snap.before.nodes);
    const postNodeIds = new Set(Object.keys(snap.after.nodes));

    if (preNodes.length === 0) {
      return this.build(100, 'Empty pre-compression graph — nothing to evaluate.', [], now);
    }

    const cutoff = this.config.frequencyCutoff >= 0
      ? this.config.frequencyCutoff
      : this.median(preNodes.map(n => n.frequency ?? 0));

    const highFreq = preNodes.filter(n => (n.frequency ?? 0) > cutoff);
    const lowFreq = preNodes.filter(n => (n.frequency ?? 0) <= cutoff);

    details.push(`Pre-compression: ${preNodes.length} nodes`);
    details.push(`Post-compression: ${Object.keys(snap.after.nodes).length} nodes`);
    details.push(`Frequency cutoff (median): ${cutoff}`);
    details.push(`High-freq nodes: ${highFreq.length}, Low-freq nodes: ${lowFreq.length}`);

    // Component 1: Preservation rate (high-freq nodes still present) — 40pts
    const preservedHighFreq = highFreq.filter(n => postNodeIds.has(n.id));
    const preservationRate = highFreq.length === 0 ? 1 : preservedHighFreq.length / highFreq.length;
    const preservationScore = preservationRate * 40;
    details.push(`High-freq preservation: ${preservedHighFreq.length} / ${highFreq.length} (${(preservationRate * 100).toFixed(1)}%)`);

    // Component 2: Archival rate (low-freq nodes removed) — 30pts
    const archivedLowFreq = lowFreq.filter(n => !postNodeIds.has(n.id));
    const archivalRate = lowFreq.length === 0 ? 1 : archivedLowFreq.length / lowFreq.length;
    const archivalScore = archivalRate * 30;
    details.push(`Low-freq archival: ${archivedLowFreq.length} / ${lowFreq.length} (${(archivalRate * 100).toFixed(1)}%)`);

    // Component 3: No data loss (high-freq node that was lost) — 15pts bonus
    const lostHighFreq = highFreq.filter(n => !postNodeIds.has(n.id));
    const dataLossScore = lostHighFreq.length === 0 ? 15 : Math.max(0, 15 - lostHighFreq.length * 3);
    if (lostHighFreq.length > 0) {
      details.push(`⚠ Lost high-freq nodes: ${lostHighFreq.map(n => n.label).slice(0, 3).join(', ')}${lostHighFreq.length > 3 ? ` +${lostHighFreq.length - 3} more` : ''}`);
    } else {
      details.push('No high-freq nodes lost during compression ✓');
    }

    // Component 4: Size reduction — 15pts
    const sizeReduction = (preNodes.length - Object.keys(snap.after.nodes).length) / preNodes.length;
    const sizeScore = sizeReduction > 0 ? Math.min(15, sizeReduction * 15 * 2) : 0;
    details.push(`Size reduction: ${(sizeReduction * 100).toFixed(1)}% of nodes archived`);

    const score = Math.min(100, preservationScore + archivalScore + dataLossScore + sizeScore);
    const summary = `Compression quality score: ${score.toFixed(0)}/100 (${lostHighFreq.length} important nodes lost)`;
    return this.build(score, summary, details, now);
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  }

  private build(score: number, summary: string, details: string[], now: string): KPIResult {
    const { passThreshold, warnThreshold } = this.config;
    const status = score >= passThreshold ? 'PASS' : score >= warnThreshold ? 'WARN' : 'FAIL';

    return {
      id: 'compression-quality',
      name: 'Context Compression Quality',
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
