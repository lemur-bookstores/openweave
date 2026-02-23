/**
 * ErrorRegistry — M10
 *
 * Builds and filters the error-registry table from a GraphSnapshot.
 * Pure data layer — no DOM. The rendering is done in app.ts.
 */

import type { GraphSnapshot, DashboardNode } from './types';

// ──────────────────────────────────────────────────────────────────────────────

export interface ErrorEntry {
  node: DashboardNode;
  isCorrected: boolean;
  /** The CORRECTION node label (if any) */
  correctedBy?: string;
}

export interface ErrorRegistryOptions {
  showCorrected?: boolean;
  searchQuery?: string;
}

// ──────────────────────────────────────────────────────────────────────────────

export class ErrorRegistry {
  /**
   * Extract all ERROR nodes from a snapshot and cross-reference CORRECTS edges.
   */
  static build(snapshot: GraphSnapshot): ErrorEntry[] {
    const nodes = Object.values(snapshot.nodes);
    const edges = Object.values(snapshot.edges);

    // Map: errorNodeId → correctionNode label
    const correctedBy = new Map<string, string>();
    for (const edge of edges) {
      if (edge.type !== 'CORRECTS') continue;
      const correctionNode = snapshot.nodes[edge.sourceId];
      if (correctionNode) {
        correctedBy.set(edge.targetId, correctionNode.label);
      }
    }

    return nodes
      .filter(n => n.type === 'ERROR')
      .map(node => ({
        node,
        isCorrected: correctedBy.has(node.id),
        correctedBy: correctedBy.get(node.id),
      }))
      .sort((a, b) => b.node.frequency - a.node.frequency);
  }

  /**
   * Apply display filters to the error list.
   */
  static filter(entries: ErrorEntry[], opts: ErrorRegistryOptions): ErrorEntry[] {
    let result = entries;

    if (!opts.showCorrected) {
      result = result.filter(e => !e.isCorrected);
    }

    if (opts.searchQuery) {
      const q = opts.searchQuery.toLowerCase();
      result = result.filter(
        e =>
          e.node.label.toLowerCase().includes(q) ||
          e.node.description?.toLowerCase().includes(q) ||
          e.correctedBy?.toLowerCase().includes(q)
      );
    }

    return result;
  }

  /**
   * Returns aggregate error statistics for the snapshot.
   */
  static stats(entries: ErrorEntry[]): {
    total: number;
    corrected: number;
    uncorrected: number;
    correctionRate: number;
  } {
    const corrected = entries.filter(e => e.isCorrected).length;
    const total = entries.length;
    return {
      total,
      corrected,
      uncorrected: total - corrected,
      correctionRate: total === 0 ? 1 : corrected / total,
    };
  }
}
