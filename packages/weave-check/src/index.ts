/**
 * @openweave/weave-check — Public API
 *
 * WeaveCheck is the eval suite & QA framework for OpenWeave.
 * It provides 5 KPI evaluators and a runner that aggregates them into
 * a single EvalReport.
 *
 * @example
 * ```ts
 * import { WeaveCheckRunner } from '@openweave/weave-check';
 *
 * const runner = new WeaveCheckRunner({ tag: 'v0.5.0' });
 * const report = runner.run({ lintReport, snapshot, sessions, milestones, compression });
 * console.log(runner.formatReport(report));
 * ```
 */

// ── Runner ───────────────────────────────────────────────────────────────
export { WeaveCheckRunner } from './runner';
export type { WeaveCheckInputs, WeaveCheckEvaluatorConfigs, WeaveCheckRunnerOptions } from './runner';

// ── Evaluators ───────────────────────────────────────────────────────────
export { OrphanRateEvaluator } from './evaluators/orphan-rate';
export type { OrphanRateConfig } from './evaluators/orphan-rate';

export { GraphCoherenceEvaluator } from './evaluators/graph-coherence';
export type { GraphCoherenceConfig } from './evaluators/graph-coherence';

export { ErrorRepetitionEvaluator } from './evaluators/error-repetition';
export type { ErrorRepetitionConfig } from './evaluators/error-repetition';

export { MilestoneAdherenceEvaluator } from './evaluators/milestone-adherence';
export type { MilestoneAdherenceConfig } from './evaluators/milestone-adherence';

export { CompressionQualityEvaluator } from './evaluators/compression-quality';
export type { CompressionQualityConfig } from './evaluators/compression-quality';

// ── Types ────────────────────────────────────────────────────────────────
export type {
  // KPI result
  KPIStatus,
  KPIResult,
  EvalReport,
  WeaveCheckConfig,
  // Input: Orphan Rate
  LintSeverity,
  OrphanEntry,
  LintReport,
  // Input: Graph Coherence / Error Repetition / Compression
  GraphNodeType,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
  GraphSnapshot,
  SessionSnapshot,
  CompressionSnapshot,
  // Input: Milestone Adherence
  TaskStatus,
  TaskPriority,
  SubTask,
  Milestone,
} from './types';
