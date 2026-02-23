/**
 * WeaveCheckRunner — M11
 *
 * Orchestrates all 5 KPI evaluators and produces a consolidated EvalReport.
 * Evaluators are run only when their input data is provided; otherwise
 * their result is marked SKIP.
 *
 * Usage:
 *   const runner = new WeaveCheckRunner({ tag: 'v0.5.0' });
 *   const report = runner.run({ lintReport, snapshot, sessions, milestones, compression });
 *   console.log(runner.formatReport(report));
 */

import { randomUUID } from 'crypto';
import {
  EvalReport,
  KPIResult,
  KPIStatus,
  WeaveCheckConfig,
  LintReport,
  GraphSnapshot,
  SessionSnapshot,
  Milestone,
  CompressionSnapshot,
} from './types';
import { OrphanRateEvaluator, OrphanRateConfig } from './evaluators/orphan-rate';
import { GraphCoherenceEvaluator, GraphCoherenceConfig } from './evaluators/graph-coherence';
import { ErrorRepetitionEvaluator, ErrorRepetitionConfig } from './evaluators/error-repetition';
import { MilestoneAdherenceEvaluator, MilestoneAdherenceConfig } from './evaluators/milestone-adherence';
import { CompressionQualityEvaluator, CompressionQualityConfig } from './evaluators/compression-quality';

// ──────────────────────────────────────────────────────────
// Input bundle
// ──────────────────────────────────────────────────────────

export interface WeaveCheckInputs {
  /** Input for OrphanRateEvaluator */
  lintReport?: LintReport;
  /** Input for GraphCoherenceEvaluator */
  snapshot?: GraphSnapshot;
  /** Input for ErrorRepetitionEvaluator (provide ≥2 for cross-session analysis) */
  sessions?: SessionSnapshot[];
  /** Input for MilestoneAdherenceEvaluator */
  milestones?: Milestone[];
  /** Input for CompressionQualityEvaluator */
  compression?: CompressionSnapshot;
}

export interface WeaveCheckEvaluatorConfigs {
  orphanRate?: OrphanRateConfig;
  graphCoherence?: GraphCoherenceConfig;
  errorRepetition?: ErrorRepetitionConfig;
  milestoneAdherence?: MilestoneAdherenceConfig;
  compressionQuality?: CompressionQualityConfig;
}

export interface WeaveCheckRunnerOptions extends WeaveCheckConfig {
  evalConfigs?: WeaveCheckEvaluatorConfigs;
}

// ──────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────

export class WeaveCheckRunner {
  private readonly options: Required<WeaveCheckRunnerOptions>;

  private readonly orphanEval: OrphanRateEvaluator;
  private readonly coherenceEval: GraphCoherenceEvaluator;
  private readonly repetitionEval: ErrorRepetitionEvaluator;
  private readonly milestoneEval: MilestoneAdherenceEvaluator;
  private readonly compressionEval: CompressionQualityEvaluator;

  constructor(options?: WeaveCheckRunnerOptions) {
    this.options = {
      passTreshold: options?.passTreshold ?? 80,
      warnThreshold: options?.warnThreshold ?? 60,
      tag: options?.tag ?? 'tag-not-set',
      skip: options?.skip ?? [],
      evalConfigs: options?.evalConfigs ?? {},
    };

    const c = this.options.evalConfigs;
    this.orphanEval = new OrphanRateEvaluator(c.orphanRate);
    this.coherenceEval = new GraphCoherenceEvaluator(c.graphCoherence);
    this.repetitionEval = new ErrorRepetitionEvaluator(c.errorRepetition);
    this.milestoneEval = new MilestoneAdherenceEvaluator(c.milestoneAdherence);
    this.compressionEval = new CompressionQualityEvaluator(c.compressionQuality);
  }

  /**
   * Run all evaluators with available inputs and return a consolidated EvalReport.
   */
  run(inputs: WeaveCheckInputs): EvalReport {
    const runId = randomUUID();
    const generatedAt = new Date().toISOString();
    const skip = new Set(this.options.skip ?? []);

    const results: KPIResult[] = [
      this.runOrSkip('orphan-rate', 'Orphan Rate', skip, () =>
        inputs.lintReport ? this.orphanEval.evaluate(inputs.lintReport) : null
      ),
      this.runOrSkip('graph-coherence', 'Graph Coherence', skip, () =>
        inputs.snapshot ? this.coherenceEval.evaluate(inputs.snapshot) : null
      ),
      this.runOrSkip('error-non-repetition', 'Error Non-Repetition Rate', skip, () =>
        inputs.sessions && inputs.sessions.length > 0
          ? this.repetitionEval.evaluate(inputs.sessions)
          : null
      ),
      this.runOrSkip('milestone-adherence', 'Milestone Adherence', skip, () =>
        inputs.milestones ? this.milestoneEval.evaluate(inputs.milestones) : null
      ),
      this.runOrSkip('compression-quality', 'Context Compression Quality', skip, () =>
        inputs.compression ? this.compressionEval.evaluate(inputs.compression) : null
      ),
    ];

    const scored = results.filter(r => r.status !== 'SKIP');
    const overallScore =
      scored.length === 0
        ? 100
        : scored.reduce((sum, r) => sum + r.score, 0) / scored.length;

    const overallStatus = this.statusFromScore(overallScore);

    const passCount = results.filter(r => r.status === 'PASS').length;
    const warnCount = results.filter(r => r.status === 'WARN').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    const skipCount = results.filter(r => r.status === 'SKIP').length;

    const summary = [
      `Overall: ${overallStatus} (score ${overallScore.toFixed(1)}/100)`,
      `KPIs: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL, ${skipCount} SKIP`,
    ].join(' · ');

    return {
      runId,
      generatedAt,
      tag: this.options.tag,
      results,
      overallScore: Math.round(overallScore * 10) / 10,
      overallStatus,
      summary,
    };
  }

  /**
   * Format an EvalReport as a human-readable string for CLI / log output.
   */
  formatReport(report: EvalReport): string {
    const lines: string[] = [
      '━━━━━━━━━━━━━━━━━━━━━━  WeaveCheck Report  ━━━━━━━━━━━━━━━━━━━━━━',
      `Run ID   : ${report.runId}`,
      `Generated: ${report.generatedAt}`,
    ];

    if (report.tag) lines.push(`Tag      : ${report.tag}`);

    lines.push('');
    lines.push('KPI Results');
    lines.push('───────────────────────────────────────────────────────────────');

    for (const r of report.results) {
      const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '⏭️ ' }[r.status];
      lines.push(`${icon} [${r.status.padEnd(4)}] ${r.name.padEnd(30)} score: ${String(r.score).padStart(5)}/100`);
      lines.push(`        ${r.summary}`);
    }

    lines.push('───────────────────────────────────────────────────────────────');
    const overallIcon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '⏭️ ' }[report.overallStatus];
    lines.push(`${overallIcon} ${report.summary}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }

  // ── private helpers ────────────────────────────────────────────────────

  private runOrSkip(
    id: string,
    name: string,
    skip: Set<string>,
    fn: () => KPIResult | null
  ): KPIResult {
    if (skip.has(id)) {
      return this.skipResult(id, name, 'Skipped by configuration.');
    }

    try {
      const result = fn();
      if (result === null) {
        return this.skipResult(id, name, 'No input data provided.');
      }
      return result;
    } catch (err) {
      return this.skipResult(id, name, `Evaluator threw: ${(err as Error).message}`);
    }
  }

  private skipResult(id: string, name: string, reason: string): KPIResult {
    return {
      id,
      name,
      status: 'SKIP',
      score: 0,
      passThreshold: 0,
      warnThreshold: 0,
      summary: reason,
      details: [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  private statusFromScore(score: number): KPIStatus {
    if (score >= this.options.passTreshold) return 'PASS';
    if (score >= this.options.warnThreshold) return 'WARN';
    return 'FAIL';
  }
}
