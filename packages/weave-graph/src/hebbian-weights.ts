import { Edge } from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HebbianOptions {
  /** Amount added to edge.weight on co-activation. Default: 0.1 */
  hebbianStrength?: number;
  /** Multiplicative factor applied to all weights per decay cycle. Default: 0.99 */
  decayRate?: number;
  /** Edges whose weight falls below this are pruned. Default: 0.05 */
  pruneThreshold?: number;
  /** Hard ceiling on edge.weight after strengthening. Default: 5.0 */
  maxWeight?: number;
}

const DEFAULT_HEBBIAN_STRENGTH = 0.1;
const DEFAULT_DECAY_RATE = 0.99;
const DEFAULT_PRUNE_THRESHOLD = 0.05;
const DEFAULT_MAX_WEIGHT = 5.0;

// ---------------------------------------------------------------------------
// Minimal graph interface — avoids circular dependency with index.ts
// ---------------------------------------------------------------------------

/**
 * Minimal structural interface that ContextGraphManager satisfies.
 * HebbianWeights only needs these methods — no import of the full class.
 */
export interface HebbianGraph {
  getEdge(edgeId: string): Edge | undefined;
  updateEdge(edgeId: string, updates: Partial<Edge>): Edge | undefined;
  getAllEdges(): Edge[];
  deleteEdge(edgeId: string): boolean;
}

// ---------------------------------------------------------------------------
// HebbianWeights
// ---------------------------------------------------------------------------

/**
 * HebbianWeights — Hebbian learning + temporal decay for graph edges.
 *
 * Models three neuronal behaviours:
 *
 * 1. **Strengthen** (`strengthen`): When two nodes are co-activated (both
 *    appear in the same query result), every edge connecting them gains
 *    `hebbianStrength` weight — "neurons that fire together, wire together."
 *
 * 2. **Decay** (`decay`): Every edge weight is multiplied by `decayRate`
 *    each cycle. Edges not reinforced by co-activation gradually weaken.
 *
 * 3. **Prune** (`prune`): Edges whose weight drops below `pruneThreshold`
 *    are deleted, keeping the graph clean and preventing stale connections
 *    from accumulating indefinitely.
 *
 * @example
 * ```ts
 * const hebb = new HebbianWeights({ hebbianStrength: 0.1, decayRate: 0.99 });
 * graph.setHebbianWeights(hebb);
 *
 * // queryNodesByLabel() auto-strengthens edges between co-activated nodes
 * graph.queryNodesByLabel("TypeScript");
 *
 * // Run decay once per session cycle
 * hebb.decay(graph);
 *
 * // Prune weak edges
 * hebb.prune(graph);
 * ```
 */
export class HebbianWeights {
  private readonly hebbianStrength: number;
  private readonly decayRate: number;
  private readonly pruneThreshold: number;
  private readonly maxWeight: number;

  constructor(options: HebbianOptions = {}) {
    this.hebbianStrength = options.hebbianStrength ?? DEFAULT_HEBBIAN_STRENGTH;
    this.decayRate = options.decayRate ?? DEFAULT_DECAY_RATE;
    this.pruneThreshold = options.pruneThreshold ?? DEFAULT_PRUNE_THRESHOLD;
    this.maxWeight = options.maxWeight ?? DEFAULT_MAX_WEIGHT;
  }

  /** Read-only view of the resolved configuration. */
  get config(): Required<HebbianOptions> {
    return {
      hebbianStrength: this.hebbianStrength,
      decayRate: this.decayRate,
      pruneThreshold: this.pruneThreshold,
      maxWeight: this.maxWeight,
    };
  }

  // ------------------------------------------------------------------
  // strengthen()
  // ------------------------------------------------------------------

  /**
   * Strengthen a single edge by `hebbianStrength`, capped at `maxWeight`.
   *
   * Intended to be called for every edge that connects two nodes that were
   * co-activated (both appeared in the same query result).
   *
   * @returns The updated edge, or `undefined` if the edge was not found.
   */
  strengthen(edgeId: string, graph: HebbianGraph): Edge | undefined {
    const edge = graph.getEdge(edgeId);
    if (!edge) return undefined;

    const currentWeight = edge.weight ?? 1.0;
    const newWeight = Math.min(currentWeight + this.hebbianStrength, this.maxWeight);

    return graph.updateEdge(edgeId, { weight: newWeight });
  }

  /**
   * Strengthen all edges that connect pairs of nodes within `nodeIds`.
   *
   * This is the batch form used by `ContextGraphManager` after a query:
   * every edge whose `sourceId` AND `targetId` both appear in the result
   * set gets strengthened once.
   *
   * @returns The list of edge ids that were strengthened.
   */
  strengthenCoActivated(nodeIds: string[], graph: HebbianGraph): string[] {
    if (nodeIds.length < 2) return [];

    const nodeSet = new Set(nodeIds);
    const strengthened: string[] = [];

    for (const edge of graph.getAllEdges()) {
      if (nodeSet.has(edge.sourceId) && nodeSet.has(edge.targetId)) {
        this.strengthen(edge.id, graph);
        strengthened.push(edge.id);
      }
    }

    return strengthened;
  }

  // ------------------------------------------------------------------
  // decay()
  // ------------------------------------------------------------------

  /**
   * Apply temporal decay to every edge in the graph.
   *
   * Each edge weight is multiplied by `decayRate` (< 1.0).
   * Edges reinforced by recent co-activation decay slower relative
   * to their higher baseline weight.
   *
   * @returns The number of edges decayed.
   */
  decay(graph: HebbianGraph): number {
    const allEdges = graph.getAllEdges();
    let count = 0;

    for (const edge of allEdges) {
      const current = edge.weight ?? 1.0;
      const decayed = current * this.decayRate;
      graph.updateEdge(edge.id, { weight: decayed });
      count++;
    }

    return count;
  }

  // ------------------------------------------------------------------
  // prune()
  // ------------------------------------------------------------------

  /**
   * Delete all edges whose weight has fallen below `pruneThreshold`.
   *
   * Can be called after `decay()` to clean up stale connections.
   *
   * @param minWeight Override the instance's `pruneThreshold` for this call.
   * @returns The number of edges deleted.
   */
  prune(graph: HebbianGraph, minWeight?: number): number {
    const threshold = minWeight ?? this.pruneThreshold;
    const toDelete: string[] = [];

    for (const edge of graph.getAllEdges()) {
      if ((edge.weight ?? 1.0) < threshold) {
        toDelete.push(edge.id);
      }
    }

    for (const id of toDelete) {
      graph.deleteEdge(id);
    }

    return toDelete.length;
  }
}
