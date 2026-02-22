import { Node, Edge, NodeType, EdgeType } from "./types";
import { NodeBuilder } from "./node";
import { EdgeBuilder } from "./edge";

/**
 * CompressionStats tracks metrics about graph compression
 */
export interface CompressionStats {
  originalNodeCount: number;
  originalEdgeCount: number;
  compressedNodeCount: number;
  compressedEdgeCount: number;
  archivedNodeCount: number;
  compressionRatio: number;
  estimatedContextSize: number;
}

/**
 * CompressionManager handles graph compression and context optimization
 * Keeps high-value nodes in active memory, archives low-frequency nodes
 */
export class CompressionManager {
  private archivedNodes: Map<string, Node> = new Map();
  private archivedEdges: Map<string, Edge> = new Map();

  /**
   * Calculate approximate size of a node in bytes (for context window estimation)
   */
  static estimateNodeSize(node: Node): number {
    // Rough estimation: labels ~50 bytes + metadata ~100 bytes
    const labelSize = node.label.length * 2;
    const descSize = (node.description || "").length * 2;
    const metadataSize = JSON.stringify(node.metadata || {}).length;
    return 50 + labelSize + descSize + metadataSize;
  }

  /**
   * Calculate approximate size of an edge in bytes
   */
  static estimateEdgeSize(edge: Edge): number {
    // Edge size: sourceId ~ 36 bytes + targetId ~ 36 bytes + type ~ 20 bytes + metadata
    const metadataSize = JSON.stringify(edge.metadata || {}).length;
    return 100 + metadataSize;
  }

  /**
   * Calculate total estimated context window usage
   */
  static calculateContextSize(nodes: Node[], edges: Edge[]): number {
    const nodesSize = nodes.reduce((sum, node) => sum + this.estimateNodeSize(node), 0);
    const edgesSize = edges.reduce((sum, edge) => sum + this.estimateEdgeSize(edge), 0);
    return nodesSize + edgesSize;
  }

  /**
   * Calculate context window usage as a percentage (0-1)
   * Assumes ~100KB max context for graph data (typical LLM context budget)
   */
  static calculateContextUsagePercentage(contextSize: number): number {
    const MAX_CONTEXT_BYTES = 100_000; // ~100KB for graph data
    return Math.min(contextSize / MAX_CONTEXT_BYTES, 1);
  }

  /**
   * Identify nodes that should be archived (low frequency, old, not critical)
   * Returns nodeIds sorted by priority for archival
   */
  static identifyArchiveCandidates(
    nodes: Node[],
    edges: Edge[],
    targetReductionPercentage: number = 0.3
  ): string[] {
    // Build a map of node importance
    const nodeImportance = new Map<string, number>();

    // Initialize with frequency
    for (const node of nodes) {
      nodeImportance.set(node.id, node.frequency ?? 1);
    }

    // Increase importance of nodes with many connections
    const connectionCount = new Map<string, number>();
    for (const edge of edges) {
      connectionCount.set(edge.sourceId, (connectionCount.get(edge.sourceId) ?? 0) + 1);
      connectionCount.set(edge.targetId, (connectionCount.get(edge.targetId) ?? 0) + 1);
    }

    for (const [nodeId, count] of connectionCount) {
      const current = nodeImportance.get(nodeId) ?? 1;
      nodeImportance.set(nodeId, current + count * 2);
    }

    // Mark ERROR nodes as candidates (they can be archived after corrections exist)
    for (const node of nodes) {
      if (node.type === NodeType.ERROR) {
        nodeImportance.set(node.id, Math.max(0.1, (nodeImportance.get(node.id) ?? 1) - 5));
      }
    }

    // Mark old nodes with low frequency as less important
    const now = new Date();
    for (const node of nodes) {
      const ageHours = (now.getTime() - node.updatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24 && (node.frequency ?? 1) < 3) {
        nodeImportance.set(node.id, (nodeImportance.get(node.id) ?? 1) * 0.5);
      }
    }

    // Sort by importance and select bottom candidates
    const sorted = Array.from(nodeImportance.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);

    const targetCount = Math.ceil(nodes.length * targetReductionPercentage);
    return sorted.slice(0, targetCount);
  }

  /**
   * Archive nodes and their dependent edges
   */
  archiveNodes(nodeIds: string[], nodes: Map<string, Node>, edges: Map<string, Edge>): void {
    const nodeIdSet = new Set(nodeIds);

    // Archive nodes
    for (const nodeId of nodeIds) {
      const node = nodes.get(nodeId);
      if (node) {
        this.archivedNodes.set(nodeId, node);
      }
    }

    // Archive edges connected to archived nodes
    for (const [edgeId, edge] of edges) {
      if (nodeIdSet.has(edge.sourceId) || nodeIdSet.has(edge.targetId)) {
        this.archivedEdges.set(edgeId, edge);
      }
    }
  }

  /**
   * Restore archived nodes back to active graph
   */
  restoreNodes(nodeIds: string[]): Map<string, Node> {
    const restored = new Map<string, Node>();
    for (const nodeId of nodeIds) {
      const node = this.archivedNodes.get(nodeId);
      if (node) {
        restored.set(nodeId, node);
        this.archivedNodes.delete(nodeId);
      }
    }
    return restored;
  }

  /**
   * Get archive statistics
   */
  getArchiveStats(): {
    archivedNodeCount: number;
    archivedEdgeCount: number;
  } {
    return {
      archivedNodeCount: this.archivedNodes.size,
      archivedEdgeCount: this.archivedEdges.size,
    };
  }

  /**
   * Clear all archives
   */
  clearArchives(): void {
    this.archivedNodes.clear();
    this.archivedEdges.clear();
  }
}

/**
 * ErrorSuppression handles marking errors and their corrections
 */
export class ErrorSuppression {
  /**
   * Mark a node as suppressed (contains an error)
   */
  static suppressNode(node: Node): Node {
    if (node.type !== NodeType.ERROR) {
      throw new Error("Only ERROR type nodes can be suppressed");
    }
    return {
      ...node,
      metadata: {
        ...node.metadata,
        suppressed: true,
        suppressedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Check if a node is suppressed
   */
  static isSuppressed(node: Node): boolean {
    return (node.metadata?.suppressed as boolean) ?? false;
  }

  /**
   * Create a correction node linked to an error node
   */
  static createCorrection(
    errorNodeId: string,
    correctionLabel: string,
    correctionDescription?: string
  ): { correctionNode: Node; correctionEdge: Edge } {
    const correctionNode = NodeBuilder.correction(correctionLabel, correctionDescription);
    const correctionEdge = EdgeBuilder.corrects(correctionNode.id, errorNodeId);

    return {
      correctionNode,
      correctionEdge,
    };
  }

  /**
   * Get all error nodes that have corrections
   */
  static findCorrectedErrors(
    nodes: Map<string, Node>,
    edges: Map<string, Edge>
  ): Map<string, { error: Node; corrections: Node[] }> {
    const correctedErrors = new Map<string, { error: Node; corrections: Node[] }>();

    for (const [, edge] of edges) {
      if (edge.type === EdgeType.CORRECTS) {
        const correctionNode = nodes.get(edge.sourceId);
        const errorNode = nodes.get(edge.targetId);

        if (correctionNode && errorNode && errorNode.type === NodeType.ERROR) {
          if (!correctedErrors.has(errorNode.id)) {
            correctedErrors.set(errorNode.id, {
              error: errorNode,
              corrections: [],
            });
          }
          correctedErrors.get(errorNode.id)!.corrections.push(correctionNode);
        }
      }
    }

    return correctedErrors;
  }

  /**
   * Get uncorrected error nodes
   */
  static findUncorrectedErrors(nodes: Map<string, Node>, edges: Map<string, Edge>): Node[] {
    const errorNodes = Array.from(nodes.values()).filter((n) => n.type === NodeType.ERROR);
    const correctedErrorIds = new Set<string>();

    for (const [, edge] of edges) {
      if (edge.type === EdgeType.CORRECTS) {
        correctedErrorIds.add(edge.targetId);
      }
    }

    return errorNodes.filter((n) => !correctedErrorIds.has(n.id));
  }
}
