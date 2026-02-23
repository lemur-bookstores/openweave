/**
 * SessionDiff — M10
 *
 * Pure diff logic: compares two GraphSnapshots and returns a structured
 * GraphDiff describing what nodes/edges were added, removed, or changed.
 *
 * Has no DOM or network dependencies — suitable for unit testing in Node.
 */

import type { GraphSnapshot, DashboardNode, GraphDiff, DiffEntry } from './types';

// ──────────────────────────────────────────────────────────────────────────────

/** Fields that, if changed, count as a "modification" */
const NODE_TRACKED_FIELDS: Array<keyof DashboardNode> = [
  'label',
  'type',
  'description',
  'frequency',
];

// ──────────────────────────────────────────────────────────────────────────────

export class SessionDiff {
  /**
   * Compute the diff between two snapshots.
   * @param sessionAId  identifier for snapshot A (used in the result)
   * @param snapshotA   the "before" snapshot
   * @param sessionBId  identifier for snapshot B
   * @param snapshotB   the "after" snapshot
   */
  static diff(
    sessionAId: string,
    snapshotA: GraphSnapshot,
    sessionBId: string,
    snapshotB: GraphSnapshot
  ): GraphDiff {
    const nodesA = snapshotA.nodes;
    const nodesB = snapshotB.nodes;
    const edgesA = snapshotA.edges;
    const edgesB = snapshotB.edges;

    // ── Nodes ──────────────────────────────────────────────────────────

    const addedNodes: DiffEntry[] = [];
    const removedNodes: DiffEntry[] = [];
    const changedNodes: GraphDiff['changedNodes'] = [];

    const allNodeIds = new Set([...Object.keys(nodesA), ...Object.keys(nodesB)]);

    for (const id of allNodeIds) {
      const a = nodesA[id];
      const b = nodesB[id];

      if (!a && b) {
        addedNodes.push({ id, label: b.label, type: b.type });
      } else if (a && !b) {
        removedNodes.push({ id, label: a.label, type: a.type });
      } else if (a && b) {
        const changes = SessionDiff.nodeChanges(a, b);
        if (changes.length > 0) {
          changedNodes.push({ id, label: b.label, type: b.type, changes });
        }
      }
    }

    // ── Edges ──────────────────────────────────────────────────────────

    const addedEdges: DiffEntry[] = [];
    const removedEdges: DiffEntry[] = [];

    const allEdgeIds = new Set([...Object.keys(edgesA), ...Object.keys(edgesB)]);

    for (const id of allEdgeIds) {
      const a = edgesA[id];
      const b = edgesB[id];

      if (!a && b) {
        addedEdges.push({
          id,
          label: `${b.sourceId} →[${b.type}]→ ${b.targetId}`,
          type: b.type,
        });
      } else if (a && !b) {
        removedEdges.push({
          id,
          label: `${a.sourceId} →[${a.type}]→ ${a.targetId}`,
          type: a.type,
        });
      }
    }

    // ── Similarity ─────────────────────────────────────────────────────

    const totalA = Object.keys(nodesA).length + Object.keys(edgesA).length;
    const totalB = Object.keys(nodesB).length + Object.keys(edgesB).length;
    const totalChanges =
      addedNodes.length + removedNodes.length + changedNodes.length +
      addedEdges.length + removedEdges.length;

    const denominator = Math.max(1, totalA, totalB);
    const similarity = Math.max(0, 1 - totalChanges / denominator);

    return {
      sessionA: sessionAId,
      sessionB: sessionBId,
      addedNodes,
      removedNodes,
      changedNodes,
      addedEdges,
      removedEdges,
      stats: {
        totalChanges,
        similarity: Math.round(similarity * 1000) / 1000,
      },
    };
  }

  /**
   * Returns a human-readable summary line for a diff.
   */
  static summarize(diff: GraphDiff): string {
    const { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges, stats } = diff;
    const parts: string[] = [];

    if (addedNodes.length) parts.push(`+${addedNodes.length} node${addedNodes.length > 1 ? 's' : ''}`);
    if (removedNodes.length) parts.push(`-${removedNodes.length} node${removedNodes.length > 1 ? 's' : ''}`);
    if (changedNodes.length) parts.push(`~${changedNodes.length} changed`);
    if (addedEdges.length) parts.push(`+${addedEdges.length} edge${addedEdges.length > 1 ? 's' : ''}`);
    if (removedEdges.length) parts.push(`-${removedEdges.length} edge${removedEdges.length > 1 ? 's' : ''}`);

    if (parts.length === 0) return 'No changes detected (identical snapshots)';
    return `${parts.join(', ')} · similarity ${(stats.similarity * 100).toFixed(0)}%`;
  }

  // ── private ─────────────────────────────────────────────────────────────

  private static nodeChanges(a: DashboardNode, b: DashboardNode): string[] {
    const changes: string[] = [];
    for (const field of NODE_TRACKED_FIELDS) {
      if (a[field] !== b[field]) {
        changes.push(`${field}: ${String(a[field])} → ${String(b[field])}`);
      }
    }
    return changes;
  }
}
