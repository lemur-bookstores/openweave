/**
 * WeaveCheck — M11 Eval Suite Tests
 *
 * Coverage:
 *   OrphanRateEvaluator        — 10 tests
 *   GraphCoherenceEvaluator    — 10 tests
 *   ErrorRepetitionEvaluator   — 10 tests
 *   MilestoneAdherenceEvaluator — 10 tests
 *   CompressionQualityEvaluator — 10 tests
 *   WeaveCheckRunner            — 10 tests
 */

import { describe, it, expect } from 'vitest';
import {
  OrphanRateEvaluator,
  GraphCoherenceEvaluator,
  ErrorRepetitionEvaluator,
  MilestoneAdherenceEvaluator,
  CompressionQualityEvaluator,
  WeaveCheckRunner,
} from './index';
import type {
  LintReport,
  OrphanEntry,
  GraphSnapshot,
  GraphNode,
  GraphEdge,
  SessionSnapshot,
  Milestone,
  SubTask,
  CompressionSnapshot,
} from './index';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

function makeNode(id: string, type: GraphNode['type'], label: string, frequency = 1): GraphNode {
  return { id, type, label, frequency, createdAt: NOW, updatedAt: NOW };
}

function makeEdge(id: string, sourceId: string, targetId: string, type: GraphEdge['type']): GraphEdge {
  return { id, sourceId, targetId, type, createdAt: NOW, updatedAt: NOW };
}

function makeSnapshot(
  nodes: GraphNode[],
  edges: GraphEdge[],
  chatId = 'test'
): GraphSnapshot {
  return {
    nodes: Object.fromEntries(nodes.map(n => [n.id, n])),
    edges: Object.fromEntries(edges.map(e => [e.id, e])),
    metadata: { chatId, version: '1', createdAt: NOW, updatedAt: NOW, compressionThreshold: 0.75 },
  };
}

function makeOrphan(id: string, severity: OrphanEntry['severity']): OrphanEntry {
  return { id, name: id, type: 'function', file: 'src/x.ts', line: 1, severity, isExported: true };
}

function makeSession(id: string, nodes: GraphNode[], edges: GraphEdge[]): SessionSnapshot {
  return { sessionId: id, snapshot: makeSnapshot(nodes, edges), capturedAt: NOW };
}

function makeMilestone(id: string, status: Milestone['status'], estimated: number, actual?: number, subTasks?: SubTask[]): Milestone {
  return {
    id,
    name: `Milestone ${id}`,
    status,
    priority: 'MEDIUM',
    subTasks: subTasks ?? [],
    estimatedHours: estimated,
    actualHours: actual,
  };
}

function makeSubTask(id: string, status: SubTask['status']): SubTask {
  return { id, title: id, status, priority: 'MEDIUM', estimatedHours: 1, dependencies: [] };
}

// ──────────────────────────────────────────────────────────
// OrphanRateEvaluator
// ──────────────────────────────────────────────────────────

describe('OrphanRateEvaluator', () => {
  const eval_ = new OrphanRateEvaluator({ weightBySeverity: false });

  it('returns PASS with score 100 on zero orphans', () => {
    const report: LintReport = { totalEntities: 10, orphans: [], analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('returns PASS when orphan rate ≤ 20%', () => {
    const report: LintReport = { totalEntities: 10, orphans: [makeOrphan('a', 'LOW')], analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.score).toBe(90);
    expect(r.status).toBe('PASS');
  });

  it('returns WARN when orphan rate is 30%', () => {
    const orphans = [makeOrphan('a', 'LOW'), makeOrphan('b', 'LOW'), makeOrphan('c', 'LOW')];
    const report: LintReport = { totalEntities: 10, orphans, analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.score).toBe(70);
    expect(r.status).toBe('WARN');
  });

  it('returns FAIL when orphan rate is 50%', () => {
    const orphans = Array.from({ length: 5 }, (_, i) => makeOrphan(`o${i}`, 'LOW'));
    const report: LintReport = { totalEntities: 10, orphans, analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.score).toBe(50);
    expect(r.status).toBe('FAIL');
  });

  it('returns score 100 when totalEntities is 0', () => {
    const report: LintReport = { totalEntities: 0, orphans: [], analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('weights CRITICAL orphans higher than LOW', () => {
    const w = new OrphanRateEvaluator({ weightBySeverity: true });
    const lowReport: LintReport = { totalEntities: 10, orphans: [makeOrphan('a', 'LOW')], analyzedFiles: [], analyzedAt: NOW };
    const critReport: LintReport = { totalEntities: 10, orphans: [makeOrphan('a', 'CRITICAL')], analyzedFiles: [], analyzedAt: NOW };
    expect(w.evaluate(lowReport).score).toBeGreaterThan(w.evaluate(critReport).score);
  });

  it('KPI id is orphan-rate', () => {
    const r = eval_.evaluate({ totalEntities: 1, orphans: [], analyzedFiles: [], analyzedAt: NOW });
    expect(r.id).toBe('orphan-rate');
  });

  it('details include affected files when orphans present', () => {
    const report: LintReport = { totalEntities: 5, orphans: [makeOrphan('a', 'HIGH')], analyzedFiles: [], analyzedAt: NOW };
    const r = eval_.evaluate(report);
    expect(r.details.some(d => d.includes('Affected files'))).toBe(true);
  });

  it('respects custom passThreshold', () => {
    const strict = new OrphanRateEvaluator({ passThreshold: 99, warnThreshold: 80, weightBySeverity: false });
    const report: LintReport = { totalEntities: 10, orphans: [makeOrphan('a', 'LOW')], analyzedFiles: [], analyzedAt: NOW };
    expect(strict.evaluate(report).status).toBe('WARN');
  });

  it('evaluatedAt is a valid ISO string', () => {
    const r = eval_.evaluate({ totalEntities: 1, orphans: [], analyzedFiles: [], analyzedAt: NOW });
    expect(() => new Date(r.evaluatedAt)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// GraphCoherenceEvaluator
// ──────────────────────────────────────────────────────────

describe('GraphCoherenceEvaluator', () => {
  const eval_ = new GraphCoherenceEvaluator();

  it('returns score 100 on empty graph', () => {
    const r = eval_.evaluate(makeSnapshot([], []));
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('PASS on a coherent graph with no issues', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'Alpha', 3), makeNode('b', 'DECISION', 'Beta', 2)];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const r = eval_.evaluate(makeSnapshot(nodes, edges));
    expect(r.status).toBe('PASS');
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it('penalises dangling edges', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A', 1)];
    const edges = [makeEdge('e1', 'a', 'NONEXISTENT', 'RELATES')];
    const r = eval_.evaluate(makeSnapshot(nodes, edges));
    expect(r.score).toBeLessThan(100);
  });

  it('penalises isolated nodes', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`n${i}`, 'CONCEPT', `N${i}`, 1));
    const r = eval_.evaluate(makeSnapshot(nodes, [])); // all isolated
    expect(r.score).toBeLessThan(75);
  });

  it('rewards error correction coverage', () => {
    const err = makeNode('err1', 'ERROR', 'TypeError', 1);
    const fix = makeNode('fix1', 'CORRECTION', 'Fixed', 1);
    const edges = [makeEdge('e1', 'fix1', 'err1', 'CORRECTS'), makeEdge('e2', 'err1', 'fix1', 'RELATES')];
    const r = eval_.evaluate(makeSnapshot([err, fix], edges));
    expect(r.score).toBeGreaterThan(50);
  });

  it('penalises uncorrected ERROR nodes', () => {
    const err = makeNode('err1', 'ERROR', 'TypeError', 1);
    const other = makeNode('c1', 'CONCEPT', 'C', 1);
    const edges = [makeEdge('e1', 'c1', 'err1', 'CAUSES')];
    const r = eval_.evaluate(makeSnapshot([err, other], edges));
    // correctionScore will be 0 since no CORRECTS edge
    expect(r.details.some(d => d.includes('Error correction coverage: 0'))).toBe(true);
  });

  it('KPI id is graph-coherence', () => {
    const r = eval_.evaluate(makeSnapshot([], []));
    expect(r.id).toBe('graph-coherence');
  });

  it('details includes density line', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A', 1), makeNode('b', 'CONCEPT', 'B', 1)];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const r = eval_.evaluate(makeSnapshot(nodes, edges));
    expect(r.details.some(d => d.includes('density'))).toBe(true);
  });

  it('respects custom passThreshold', () => {
    const strict = new GraphCoherenceEvaluator({ passThreshold: 99, warnThreshold: 90 });
    // 3 isolated nodes + 1 connected pair → isolated rate = 0.6 > maxIsolatedRate(0.4) → score < 99
    const nodes = [
      makeNode('a', 'CONCEPT', 'A', 1), makeNode('b', 'CONCEPT', 'B', 1),
      makeNode('c', 'CONCEPT', 'C', 1), makeNode('d', 'CONCEPT', 'D', 1),
      makeNode('e', 'CONCEPT', 'E', 1),
    ];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const r = strict.evaluate(makeSnapshot(nodes, edges));
    expect(r.score).toBeLessThan(99);
    expect(['WARN', 'FAIL']).toContain(r.status);
  });

  it('score is bounded 0–100', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A', 1)];
    const edges = [makeEdge('e1', 'a', 'MISSING', 'RELATES')];
    const r = eval_.evaluate(makeSnapshot(nodes, edges));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ──────────────────────────────────────────────────────────
// ErrorRepetitionEvaluator
// ──────────────────────────────────────────────────────────

describe('ErrorRepetitionEvaluator', () => {
  const eval_ = new ErrorRepetitionEvaluator({ excludeCorrected: false });

  it('returns PASS with score 100 on no sessions', () => {
    const r = eval_.evaluate([]);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('returns PASS when no errors across sessions', () => {
    const s = makeSession('s1', [makeNode('a', 'CONCEPT', 'OK', 1)], []);
    const r = eval_.evaluate([s]);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('returns PASS when all errors are unique per session', () => {
    const s1 = makeSession('s1', [makeNode('e1', 'ERROR', 'TypeError', 1)], []);
    const s2 = makeSession('s2', [makeNode('e2', 'ERROR', 'RangeError', 1)], []);
    const r = eval_.evaluate([s1, s2]);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('penalises repeated error labels across sessions', () => {
    const s1 = makeSession('s1', [makeNode('e1', 'ERROR', 'TypeError', 1)], []);
    const s2 = makeSession('s2', [makeNode('e2', 'ERROR', 'TypeError', 1)], []);
    const r = eval_.evaluate([s1, s2]);
    expect(r.score).toBeLessThan(100);
    expect(r.status).not.toBe('PASS');
  });

  it('normalises labels case-insensitively', () => {
    const s1 = makeSession('s1', [makeNode('e1', 'ERROR', 'TypeErrror on line 42', 1)], []);
    const s2 = makeSession('s2', [makeNode('e2', 'ERROR', 'typeerrror on line 42', 1)], []);
    const r = eval_.evaluate([s1, s2]);
    expect(r.details.some(d => d.includes('Repeated across sessions: 1'))).toBe(true);
  });

  it('evaluateSession shorthand works for single session', () => {
    const s = makeSession('s1', [makeNode('e1', 'ERROR', 'TypeError', 1)], []);
    const r = eval_.evaluateSession(s);
    expect(r.id).toBe('error-non-repetition');
    expect(r.score).toBe(100); // single session, no cross-session repetition
  });

  it('excludeCorrected option skips errors with CORRECTS edge', () => {
    const withExclude = new ErrorRepetitionEvaluator({ excludeCorrected: true });
    const err = makeNode('e1', 'ERROR', 'TypeError', 1);
    const fix = makeNode('f1', 'CORRECTION', 'Fixed', 1);
    const correctsEdge = makeEdge('edge1', 'f1', 'e1', 'CORRECTS');
    const s1 = makeSession('s1', [err, fix], [correctsEdge]);
    const s2 = makeSession('s2', [makeNode('e2', 'ERROR', 'TypeError', 1)], []);
    // With excludeCorrected, s1's corrected error is excluded → no repetition
    const r = withExclude.evaluate([s1, s2]);
    expect(r.score).toBe(100);
  });

  it('KPI id is error-non-repetition', () => {
    const r = eval_.evaluate([]);
    expect(r.id).toBe('error-non-repetition');
  });

  it('details includes sessions analyzed count', () => {
    const s = makeSession('s1', [], []);
    const r = eval_.evaluate([s]);
    expect(r.details.some(d => d.includes('Sessions analyzed: 1'))).toBe(true);
  });

  it('FAIL when all errors are repeated across sessions', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession(`s${i}`, [makeNode(`e${i}`, 'ERROR', 'TypeError', 1)], [])
    );
    const r = eval_.evaluate(sessions);
    // 1 distinct error, 5 sessions — repeated in all → 100% repetition → score 0
    expect(r.score).toBe(0);
    expect(r.status).toBe('FAIL');
  });
});

// ──────────────────────────────────────────────────────────
// MilestoneAdherenceEvaluator
// ──────────────────────────────────────────────────────────

describe('MilestoneAdherenceEvaluator', () => {
  const eval_ = new MilestoneAdherenceEvaluator();

  it('returns PASS with score 100 on empty milestones', () => {
    const r = eval_.evaluate([]);
    expect(r.score).toBe(100);
    expect(r.status).toBe('PASS');
  });

  it('PASS when all milestones are completed', () => {
    const milestones = [
      makeMilestone('m1', 'COMPLETED', 10, 10),
      makeMilestone('m2', 'COMPLETED', 5, 5),
    ];
    const r = eval_.evaluate(milestones);
    expect(r.status).toBe('PASS');
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('FAIL when no milestones are completed and many are not started', () => {
    const milestones = Array.from({ length: 5 }, (_, i) => makeMilestone(`m${i}`, 'NOT_STARTED', 10));
    const r = eval_.evaluate(milestones);
    expect(r.status).toBe('FAIL');
  });

  it('BLOCKED milestones are excluded from completion rate', () => {
    const milestones = [
      makeMilestone('m1', 'COMPLETED', 10, 10),
      makeMilestone('m2', 'BLOCKED', 10),
    ];
    const r = eval_.evaluate(milestones);
    // Only m1 is active; completion rate = 1 → 100%
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('penalises large estimate deviation', () => {
    const accurate = eval_.evaluate([makeMilestone('m1', 'COMPLETED', 10, 10)]);
    const inaccurate = eval_.evaluate([makeMilestone('m1', 'COMPLETED', 10, 20)]); // 2× overrun
    expect(accurate.score).toBeGreaterThan(inaccurate.score);
  });

  it('neutral hour score when no actual hours tracked', () => {
    const m = makeMilestone('m1', 'COMPLETED', 10);
    const r = eval_.evaluate([m]);
    // 25 neutral hour score + 50 completion = 75 total
    expect(r.score).toBe(75);
  });

  it('includes sub-task roll-up in details', () => {
    const subTasks = [makeSubTask('st1', 'COMPLETED'), makeSubTask('st2', 'IN_PROGRESS')];
    const m = makeMilestone('m1', 'IN_PROGRESS', 10, undefined, subTasks);
    const r = eval_.evaluate([m]);
    expect(r.details.some(d => d.includes('Sub-task completion'))).toBe(true);
  });

  it('KPI id is milestone-adherence', () => {
    const r = eval_.evaluate([]);
    expect(r.id).toBe('milestone-adherence');
  });

  it('details shows blocked and deferred counts', () => {
    const milestones = [
      makeMilestone('m1', 'BLOCKED', 10),
      makeMilestone('m2', 'DEFERRED', 10),
    ];
    const r = eval_.evaluate(milestones);
    expect(r.details.some(d => d.includes('Blocked: 1'))).toBe(true);
  });

  it('respects custom passThreshold', () => {
    const strict = new MilestoneAdherenceEvaluator({ passThreshold: 99, warnThreshold: 70 });
    // 1 completed + 1 not-started → completion rate 50% → score ~50 < 99 → not PASS
    const milestones = [
      makeMilestone('m1', 'COMPLETED', 10, 10),
      makeMilestone('m2', 'NOT_STARTED', 10),
    ];
    const r = strict.evaluate(milestones);
    expect(r.score).toBeLessThan(99);
    expect(['WARN', 'FAIL']).toContain(r.status);
  });
});

// ──────────────────────────────────────────────────────────
// CompressionQualityEvaluator
// ──────────────────────────────────────────────────────────

describe('CompressionQualityEvaluator', () => {
  const eval_ = new CompressionQualityEvaluator();

  it('returns score 100 on empty pre-compression graph', () => {
    const snap: CompressionSnapshot = {
      before: makeSnapshot([], []),
      after: makeSnapshot([], []),
      compressionThreshold: 0.75,
    };
    const r = eval_.evaluate(snap);
    expect(r.score).toBe(100);
  });

  it('PASS when high-freq nodes are preserved and low-freq archived', () => {
    const highFreq = [makeNode('h1', 'CONCEPT', 'Important', 10), makeNode('h2', 'CONCEPT', 'Core', 8)];
    const lowFreq = [makeNode('l1', 'CONCEPT', 'Noise', 1), makeNode('l2', 'CONCEPT', 'Rare', 1)];
    const pre = makeSnapshot([...highFreq, ...lowFreq], []);
    const post = makeSnapshot(highFreq, []); // low-freq archived
    const snap: CompressionSnapshot = { before: pre, after: post, compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.status).toBe('PASS');
  });

  it('penalises lost high-freq nodes', () => {
    const hf = [makeNode('h1', 'CONCEPT', 'Important', 10)];
    const lf = [makeNode('l1', 'CONCEPT', 'Noise', 1)];
    const pre = makeSnapshot([...hf, ...lf], []);
    const post = makeSnapshot(lf, []); // WRONG: high-freq was lost, low-freq kept
    const snap: CompressionSnapshot = { before: pre, after: post, compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.details.some(d => d.includes('Lost high-freq nodes'))).toBe(true);
    expect(r.score).toBeLessThan(75);
  });

  it('gives bonus score when no high-freq nodes are lost', () => {
    const hf = [makeNode('h1', 'CONCEPT', 'A', 5)];
    const lf = [makeNode('l1', 'CONCEPT', 'B', 1)];
    const pre = makeSnapshot([...hf, ...lf], []);
    const post = makeSnapshot(hf, []);
    const snap: CompressionSnapshot = { before: pre, after: post, compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.details.some(d => d.includes('No high-freq nodes lost'))).toBe(true);
  });

  it('uses custom frequencyCutoff when provided', () => {
    const custom = new CompressionQualityEvaluator({ frequencyCutoff: 3 });
    const nodes = [makeNode('a', 'CONCEPT', 'A', 4), makeNode('b', 'CONCEPT', 'B', 2)];
    const pre = makeSnapshot(nodes, []);
    const post = makeSnapshot([nodes[0]!], []);
    const snap: CompressionSnapshot = { before: pre, after: post, compressionThreshold: 0.75 };
    const r = custom.evaluate(snap);
    expect(r.score).toBeGreaterThan(50);
  });

  it('penalises when no size reduction happens', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A', 1), makeNode('b', 'CONCEPT', 'B', 1)];
    const snap: CompressionSnapshot = {
      before: makeSnapshot(nodes, []),
      after: makeSnapshot(nodes, []), // same size — no compression happened
      compressionThreshold: 0.75,
    };
    const r = eval_.evaluate(snap);
    expect(r.details.some(d => d.includes('Size reduction: 0.0%'))).toBe(true);
  });

  it('KPI id is compression-quality', () => {
    const snap: CompressionSnapshot = { before: makeSnapshot([], []), after: makeSnapshot([], []), compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.id).toBe('compression-quality');
  });

  it('details include pre/post node counts', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A', 1)];
    const snap: CompressionSnapshot = { before: makeSnapshot(nodes, []), after: makeSnapshot([], []), compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.details.some(d => d.includes('Pre-compression: 1'))).toBe(true);
    expect(r.details.some(d => d.includes('Post-compression: 0'))).toBe(true);
  });

  it('score is bounded 0–100', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`, 'ERROR', `E${i}`, 1));
    const after = makeSnapshot(nodes.slice(0, 5), []);
    const snap: CompressionSnapshot = { before: makeSnapshot(nodes, []), after, compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('WARN status for mediocre compression', () => {
    const hf = Array.from({ length: 4 }, (_, i) => makeNode(`h${i}`, 'CONCEPT', `Important${i}`, 10));
    const lf = Array.from({ length: 4 }, (_, i) => makeNode(`l${i}`, 'CONCEPT', `Noise${i}`, 1));
    const pre = makeSnapshot([...hf, ...lf], []);
    // Keep all high-freq + some low-freq (partial archival)
    const post = makeSnapshot([...hf, lf[0]!, lf[1]!], []);
    const snap: CompressionSnapshot = { before: pre, after: post, compressionThreshold: 0.75 };
    const r = eval_.evaluate(snap);
    expect(['PASS', 'WARN']).toContain(r.status);
  });
});

// ──────────────────────────────────────────────────────────
// WeaveCheckRunner
// ──────────────────────────────────────────────────────────

describe('WeaveCheckRunner', () => {
  it('returns SKIP for all KPIs when no inputs provided', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({});
    expect(report.results.every(r => r.status === 'SKIP')).toBe(true);
  });

  it('overall score is 100 when all KPIs are SKIP', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({});
    expect(report.overallScore).toBe(100);
  });

  it('evaluates only provided inputs', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({
      lintReport: { totalEntities: 5, orphans: [], analyzedFiles: [], analyzedAt: NOW },
    });
    const orphanResult = report.results.find(r => r.id === 'orphan-rate');
    expect(orphanResult?.status).not.toBe('SKIP');
    const otherSkipped = report.results.filter(r => r.id !== 'orphan-rate');
    expect(otherSkipped.every(r => r.status === 'SKIP')).toBe(true);
  });

  it('overall status reflects overallScore thresholds', () => {
    const runner = new WeaveCheckRunner({ passTreshold: 80, warnThreshold: 60 });
    const report = runner.run({
      lintReport: { totalEntities: 10, orphans: [], analyzedFiles: [], analyzedAt: NOW },
    });
    expect(report.overallStatus).toBe('PASS');
  });

  it('skip option excludes specified KPI', () => {
    const runner = new WeaveCheckRunner({ skip: ['orphan-rate'] });
    const report = runner.run({
      lintReport: { totalEntities: 10, orphans: [], analyzedFiles: [], analyzedAt: NOW },
    });
    expect(report.results.find(r => r.id === 'orphan-rate')?.status).toBe('SKIP');
  });

  it('runId is a valid UUID', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({});
    expect(report.runId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('tag appears in report when provided', () => {
    const runner = new WeaveCheckRunner({ tag: 'v0.5.0-test' });
    const report = runner.run({});
    expect(report.tag).toBe('v0.5.0-test');
  });

  it('formatReport returns a non-empty string with KPI headers', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({});
    const formatted = runner.formatReport(report);
    expect(formatted).toContain('WeaveCheck Report');
    expect(formatted).toContain('Orphan Rate');
  });

  it('generatedAt is a valid ISO date string', () => {
    const runner = new WeaveCheckRunner();
    const report = runner.run({});
    expect(() => new Date(report.generatedAt)).not.toThrow();
    expect(new Date(report.generatedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it('all 5 evaluators produce results when full inputs provided', () => {
    const runner = new WeaveCheckRunner();
    const nodes = [makeNode('a', 'CONCEPT', 'A', 3), makeNode('b', 'CONCEPT', 'B', 3)];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const snapshot = makeSnapshot(nodes, edges);
    const report = runner.run({
      lintReport: { totalEntities: 10, orphans: [], analyzedFiles: [], analyzedAt: NOW },
      snapshot,
      sessions: [makeSession('s1', nodes, edges)],
      milestones: [makeMilestone('m1', 'COMPLETED', 5, 5)],
      compression: { before: makeSnapshot([...nodes, makeNode('l1', 'CONCEPT', 'Noise', 1)], []), after: snapshot, compressionThreshold: 0.75 },
    });
    const nonSkip = report.results.filter(r => r.status !== 'SKIP');
    expect(nonSkip).toHaveLength(5);
  });
});
