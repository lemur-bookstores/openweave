/**
 * Milestone Adherence Evaluator — M11
 *
 * KPI: measures how well milestones are being completed on schedule
 * and how closely actual hours track estimated hours.
 *
 * Scoring components (each 50 pts max):
 *   1. Completion rate  — % of non-deferred milestones that are COMPLETED
 *   2. Hour accuracy    — 1 - |actual - estimated| / estimated (avg across completed)
 *
 * Scoring:
 *   PASS  ≥ 70
 *   WARN  ≥ 50
 *   FAIL  <  50
 *
 * BLOCKED and DEFERRED milestones are excluded from completion-rate
 * calculations (neither penalised nor rewarded).
 */

import { KPIResult, Milestone, TaskStatus } from '../types';

export interface MilestoneAdherenceConfig {
  passThreshold?: number; // default 70
  warnThreshold?: number; // default 50
  /**
   * Max acceptable hour deviation ratio to still score 100% on accuracy.
   * e.g., 0.2 = within ±20% of estimate gets full score.
   */
  hourToleranceRatio?: number;
}

export class MilestoneAdherenceEvaluator {
  private config: Required<MilestoneAdherenceConfig>;

  static readonly ACTIVE_STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];

  constructor(config?: MilestoneAdherenceConfig) {
    this.config = {
      passThreshold: config?.passThreshold ?? 70,
      warnThreshold: config?.warnThreshold ?? 50,
      hourToleranceRatio: config?.hourToleranceRatio ?? 0.25,
    };
  }

  evaluate(milestones: Milestone[]): KPIResult {
    const now = new Date().toISOString();

    if (milestones.length === 0) {
      return this.build(100, 'No milestones provided — nothing to evaluate.', [], now);
    }

    const details: string[] = [];

    // Exclude DEFERRED/BLOCKED from active set
    const active = milestones.filter(m =>
      MilestoneAdherenceEvaluator.ACTIVE_STATUSES.includes(m.status)
    );
    const completed = active.filter(m => m.status === 'COMPLETED');
    const inProgress = active.filter(m => m.status === 'IN_PROGRESS');
    const notStarted = active.filter(m => m.status === 'NOT_STARTED');
    const blocked = milestones.filter(m => m.status === 'BLOCKED');
    const deferred = milestones.filter(m => m.status === 'DEFERRED');

    details.push(`Total milestones: ${milestones.length}`);
    details.push(`  Completed: ${completed.length}, In Progress: ${inProgress.length}, Not Started: ${notStarted.length}`);
    details.push(`  Blocked: ${blocked.length}, Deferred: ${deferred.length}`);

    // Component 1: Completion rate (0–50)
    const completionRate = active.length === 0 ? 1 : completed.length / active.length;
    const completionScore = completionRate * 50;
    details.push(`Completion rate: ${(completionRate * 100).toFixed(1)}% of active milestones`);

    // Component 2: Hour accuracy (0–50) — only for completed with actual hours
    const completedWithHours = completed.filter(
      m => m.estimatedHours > 0 && m.actualHours !== undefined
    );
    let hourScore = 25; // Neutral if no data

    if (completedWithHours.length > 0) {
      const accuracies = completedWithHours.map(m => {
        const deviation = Math.abs((m.actualHours! - m.estimatedHours)) / m.estimatedHours;
        // Full score within tolerance, linearly degrading beyond
        return Math.max(0, 1 - Math.max(0, deviation - this.config.hourToleranceRatio));
      });
      const avgAccuracy = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
      hourScore = avgAccuracy * 50;

      const avgDeviation = completedWithHours
        .map(m => ((m.actualHours! - m.estimatedHours) / m.estimatedHours) * 100)
        .reduce((s, v) => s + v, 0) / completedWithHours.length;

      details.push(
        `Hour accuracy: avg deviation ${avgDeviation > 0 ? '+' : ''}${avgDeviation.toFixed(1)}% vs estimate (${completedWithHours.length} milestones tracked)`
      );
    } else {
      details.push('Hour accuracy: no completed milestones with actual hours tracked (neutral score)');
    }

    // Sub-task roll-up
    const allSubTasks = milestones.flatMap(m => m.subTasks ?? []);
    if (allSubTasks.length > 0) {
      const completedSt = allSubTasks.filter(st => st.status === 'COMPLETED').length;
      details.push(`Sub-task completion: ${completedSt} / ${allSubTasks.length} (${((completedSt / allSubTasks.length) * 100).toFixed(0)}%)`);
    }

    const score = completionScore + hourScore;
    const summary = `Milestone adherence: ${(completionRate * 100).toFixed(0)}% complete — score ${score.toFixed(0)}/100`;
    return this.build(score, summary, details, now);
  }

  private build(score: number, summary: string, details: string[], now: string): KPIResult {
    const { passThreshold, warnThreshold } = this.config;
    const status = score >= passThreshold ? 'PASS' : score >= warnThreshold ? 'WARN' : 'FAIL';

    return {
      id: 'milestone-adherence',
      name: 'Milestone Adherence',
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
