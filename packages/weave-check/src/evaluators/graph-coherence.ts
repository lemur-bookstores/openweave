/**
 * Graph Coherence Evaluator — M11
 *
 * KPI: measures structural integrity of the WeaveGraph.
 * Checks for dangling edges, isolated nodes, and correction coverage.
 *
 * Sub-checks (each worth 25 pts):
 *   1. No dangling edges (edge references non-existent node)
 *   2. Low isolated node rate (nodes with no edges)
 *   3. Error correction coverage (ERROR nodes have at least one CORRECTS edge)
 *   4. Adequate graph density (edges-per-node ratio ≥ 0.5)
 *
 * Score = weighted average of sub-check scores (0–100)
 *
 * Scoring:
 *   PASS  ≥ 75
 *   WARN  ≥ 50
 *   FAIL  <  50
 */

import { KPIResult, GraphSnapshot } from '../types';

export interface GraphCoherenceConfig {
  passThreshold?: number;  // default 75
  warnThreshold?: number;  // default 50
  /** Minimum acceptable edges-per-node ratio */
  minDensityRatio?: number; // default 0.5
  /** Max acceptable isolated node rate (0–1) */
  maxIsolatedRate?: number; // default 0.4
}

export class GraphCoherenceEvaluator {
  private config: Required<GraphCoherenceConfig>;

  constructor(config?: GraphCoherenceConfig) {
    this.config = {
      passThreshold: config?.passThreshold ?? 75,
      warnThreshold: config?.warnThreshold ?? 50,
      minDensityRatio: config?.minDensityRatio ?? 0.5,
      maxIsolatedRate: config?.maxIsolatedRate ?? 0.4,
    };
  }

  evaluate(snapshot: GraphSnapshot): KPIResult {
    const now = new Date().toISOString();
    const nodes = Object.values(snapshot.nodes);
    const edges = Object.values(snapshot.edges);

    if (nodes.length === 0) {
      return this.build(100, 'Empty graph — nothing to evaluate.', [], now);
    }

    const nodeIds = new Set(Object.keys(snapshot.nodes));
    const details: string[] = [];

    // Sub-check 1: Dangling edges
    const danglingEdges = edges.filter(
      e => !nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)
    );
    const danglingScore = danglingEdges.length === 0
      ? 25
      : Math.max(0, 25 - (danglingEdges.length / Math.max(1, edges.length)) * 25);

    details.push(`Dangling edges: ${danglingEdges.length} / ${edges.length}`);
    if (danglingEdges.length > 0) {
      details.push(`  First dangling: ${danglingEdges[0].id} (${danglingEdges[0].sourceId} → ${danglingEdges[0].targetId})`);
    }

    // Sub-check 2: Isolated nodes
    const connectedNodeIds = new Set<string>();
    for (const e of edges) {
      connectedNodeIds.add(e.sourceId);
      connectedNodeIds.add(e.targetId);
    }
    const isolatedNodes = nodes.filter(n => !connectedNodeIds.has(n.id));
    const isolatedRate = isolatedNodes.length / nodes.length;
    const isolatedScore = isolatedRate <= this.config.maxIsolatedRate
      ? 25
      : Math.max(0, 25 * (1 - (isolatedRate - this.config.maxIsolatedRate) / (1 - this.config.maxIsolatedRate)));

    details.push(`Isolated nodes: ${isolatedNodes.length} / ${nodes.length} (${(isolatedRate * 100).toFixed(1)}%)`);

    // Sub-check 3: Error correction coverage
    const errorNodes = nodes.filter(n => n.type === 'ERROR');
    const correctedErrorIds = new Set(
      edges.filter(e => e.type === 'CORRECTS').map(e => e.targetId)
    );
    const uncorrectedErrors = errorNodes.filter(n => !correctedErrorIds.has(n.id));
    const correctionScore = errorNodes.length === 0
      ? 25
      : Math.max(0, 25 * (1 - uncorrectedErrors.length / errorNodes.length));

    if (errorNodes.length > 0) {
      details.push(
        `Error correction coverage: ${errorNodes.length - uncorrectedErrors.length} / ${errorNodes.length} errors corrected`
      );
    } else {
      details.push('No ERROR nodes — correction coverage N/A (full score)');
    }

    // Sub-check 4: Graph density
    const densityRatio = nodes.length === 0 ? 0 : edges.length / nodes.length;
    const densityScore = densityRatio >= this.config.minDensityRatio
      ? 25
      : Math.max(0, 25 * (densityRatio / this.config.minDensityRatio));

    details.push(`Graph density: ${densityRatio.toFixed(2)} edges/node (min: ${this.config.minDensityRatio})`);

    const score = danglingScore + isolatedScore + correctionScore + densityScore;
    const summary = `Graph coherence score: ${score.toFixed(0)}/100 (${nodes.length} nodes, ${edges.length} edges)`;
    return this.build(score, summary, details, now);
  }

  private build(score: number, summary: string, details: string[], now: string): KPIResult {
    const { passThreshold, warnThreshold } = this.config;
    const status = score >= passThreshold ? 'PASS' : score >= warnThreshold ? 'WARN' : 'FAIL';

    return {
      id: 'graph-coherence',
      name: 'Graph Coherence',
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
