/**
 * Error Non-Repetition Evaluator — M11
 *
 * KPI: measures whether the agent avoids repeating the same errors
 * across multiple sessions (or within a single session's history).
 *
 * Methodology:
 *   Given N session snapshots, normalise all ERROR node labels and
 *   count how many distinct error labels appear in more than one session.
 *   A "repeated error" = same normalised label in ≥2 distinct sessions.
 *
 *   repetition_rate = repeated_errors / total_distinct_errors
 *   score           = (1 − repetition_rate) × 100
 *
 * Scoring:
 *   PASS  ≥ 80  (≤20% repetition)
 *   WARN  ≥ 60  (≤40% repetition)
 *   FAIL  <  60  (>40% repetition)
 *
 * For a single snapshot, checks intra-session: ERROR nodes that already
 * have a CORRECTS edge (self-corrected) are not penalised.
 */

import { KPIResult, SessionSnapshot, GraphNode } from '../types';

export interface ErrorRepetitionConfig {
  passThreshold?: number; // default 80
  warnThreshold?: number; // default 60
  /**
   * If true, errors that have already been corrected within the same
   * session are excluded from the repetition count.
   */
  excludeCorrected?: boolean;
}

export class ErrorRepetitionEvaluator {
  private config: Required<ErrorRepetitionConfig>;

  constructor(config?: ErrorRepetitionConfig) {
    this.config = {
      passThreshold: config?.passThreshold ?? 80,
      warnThreshold: config?.warnThreshold ?? 60,
      excludeCorrected: config?.excludeCorrected ?? true,
    };
  }

  /**
   * Multi-session evaluation: compare error labels across sessions.
   */
  evaluate(sessions: SessionSnapshot[]): KPIResult {
    const now = new Date().toISOString();
    const details: string[] = [];

    if (sessions.length === 0) {
      return this.build(100, 'No sessions provided — nothing to evaluate.', [], now);
    }

    // Collect errors per session
    const errorsBySession: Map<string, Set<string>> = new Map();

    for (const session of sessions) {
      const nodes = Object.values(session.snapshot.nodes);
      const edges = Object.values(session.snapshot.edges);

      const correctedIds = this.config.excludeCorrected
        ? new Set(edges.filter(e => e.type === 'CORRECTS').map(e => e.targetId))
        : new Set<string>();

      const errorLabels = nodes
        .filter((n): n is GraphNode => n.type === 'ERROR' && !correctedIds.has(n.id))
        .map(n => this.normalizeLabel(n.label));

      errorsBySession.set(session.sessionId, new Set(errorLabels));
    }

    // Count occurrences of each label across sessions
    const globalLabelCount = new Map<string, number>();
    for (const labels of errorsBySession.values()) {
      for (const label of labels) {
        globalLabelCount.set(label, (globalLabelCount.get(label) ?? 0) + 1);
      }
    }

    const totalDistinct = globalLabelCount.size;
    const repeated = [...globalLabelCount.entries()].filter(([, count]) => count > 1);

    details.push(`Sessions analyzed: ${sessions.length}`);
    details.push(`Distinct error labels: ${totalDistinct}`);
    details.push(`Repeated across sessions: ${repeated.length}`);

    if (repeated.length > 0) {
      const examples = repeated
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => `  "${label}" appeared in ${count} session(s)`)
        .join('\n');
      details.push(`Top repeated errors:\n${examples}`);
    }

    if (totalDistinct === 0) {
      return this.build(100, 'No uncorrected errors found across sessions.', details, now);
    }

    const repetitionRate = repeated.length / totalDistinct;
    const score = Math.max(0, Math.min(100, (1 - repetitionRate) * 100));

    const summary = `Error repetition: ${repeated.length}/${totalDistinct} errors repeated across sessions — score ${score.toFixed(0)}/100`;
    return this.build(score, summary, details, now);
  }

  /**
   * Single-session shorthand.
   */
  evaluateSession(session: SessionSnapshot): KPIResult {
    return this.evaluate([session]);
  }

  private normalizeLabel(label: string): string {
    return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  private build(score: number, summary: string, details: string[], now: string): KPIResult {
    const { passThreshold, warnThreshold } = this.config;
    const status = score >= passThreshold ? 'PASS' : score >= warnThreshold ? 'WARN' : 'FAIL';

    return {
      id: 'error-non-repetition',
      name: 'Error Non-Repetition Rate',
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
