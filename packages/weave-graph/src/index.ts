import { Node, Edge, NodeType, EdgeType, GraphSnapshot } from "./types";
import { NodeBuilder } from "./node";
import { EdgeBuilder } from "./edge";

/**
 * ContextGraphManager
 * Main interface for managing the WeaveGraph
 * Handles node/edge operations, queries, and persistence metadata
 */
export class ContextGraphManager {
  private nodes: Map<string, Node>;
  private edges: Map<string, Edge>;
  private edgesBySource: Map<string, Set<string>>; // sourceId -> Set<edgeId>
  private edgesByTarget: Map<string, Set<string>>; // targetId -> Set<edgeId>
  private nodesByLabel: Map<string, Set<string>>; // label (lowercased) -> Set<nodeId>
  private chatId: string;
  private compressionThreshold: number = 0.75;
  private version: string = "0.1.0";
  private createdAt: Date;
  private updatedAt: Date;

  constructor(chatId: string, compressionThreshold?: number) {
    this.chatId = chatId;
    this.nodes = new Map();
    this.edges = new Map();
    this.edgesBySource = new Map();
    this.edgesByTarget = new Map();
    this.nodesByLabel = new Map();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    if (compressionThreshold !== undefined) {
      this.compressionThreshold = compressionThreshold;
    }
  }

  /**
   * Add a node to the graph
   */
  addNode(node: Node): Node {
    this.nodes.set(node.id, node);
    
    // Index by label for keyword search
    const labelKey = node.label.toLowerCase();
    if (!this.nodesByLabel.has(labelKey)) {
      this.nodesByLabel.set(labelKey, new Set());
    }
    this.nodesByLabel.get(labelKey)!.add(node.id);
    
    this.updatedAt = new Date();
    return node;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): Node | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Update an existing node
   */
  updateNode(nodeId: string, updates: Partial<Node>): Node | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;

    const updated = NodeBuilder.clone(node, updates);
    this.nodes.set(nodeId, updated);
    this.updatedAt = new Date();
    return updated;
  }

  /**
   * Delete a node (and all related edges)
   */
  deleteNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove label index
    const labelKey = node.label.toLowerCase();
    const labelSet = this.nodesByLabel.get(labelKey);
    if (labelSet) {
      labelSet.delete(nodeId);
      if (labelSet.size === 0) {
        this.nodesByLabel.delete(labelKey);
      }
    }

    // Remove all connected edges
    const sourceEdges = this.edgesBySource.get(nodeId) || new Set();
    const targetEdges = this.edgesByTarget.get(nodeId) || new Set();
    
    [...sourceEdges, ...targetEdges].forEach((edgeId) => {
      this.edges.delete(edgeId);
    });

    this.edgesBySource.delete(nodeId);
    this.edgesByTarget.delete(nodeId);

    this.nodes.delete(nodeId);
    this.updatedAt = new Date();
    return true;
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: Edge): Edge {
    this.edges.set(edge.id, edge);

    // Index by source and target
    if (!this.edgesBySource.has(edge.sourceId)) {
      this.edgesBySource.set(edge.sourceId, new Set());
    }
    this.edgesBySource.get(edge.sourceId)!.add(edge.id);

    if (!this.edgesByTarget.has(edge.targetId)) {
      this.edgesByTarget.set(edge.targetId, new Set());
    }
    this.edgesByTarget.get(edge.targetId)!.add(edge.id);

    this.updatedAt = new Date();
    return edge;
  }

  /**
   * Get an edge by ID
   */
  getEdge(edgeId: string): Edge | undefined {
    return this.edges.get(edgeId);
  }

  /**
   * Update an existing edge
   */
  updateEdge(edgeId: string, updates: Partial<Edge>): Edge | undefined {
    const edge = this.edges.get(edgeId);
    if (!edge) return undefined;

    const updated = EdgeBuilder.clone(edge, updates);
    this.edges.set(edgeId, updated);
    this.updatedAt = new Date();
    return updated;
  }

  /**
   * Delete an edge
   */
  deleteEdge(edgeId: string): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) return false;

    this.edgesBySource.get(edge.sourceId)?.delete(edgeId);
    this.edgesByTarget.get(edge.targetId)?.delete(edgeId);

    this.edges.delete(edgeId);
    this.updatedAt = new Date();
    return true;
  }

  /**
   * Get all edges from a source node
   */
  getEdgesFromNode(nodeId: string): Edge[] {
    const edgeIds = this.edgesBySource.get(nodeId) || new Set();
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id)!)
      .filter((edge) => edge !== undefined);
  }

  /**
   * Get all edges to a target node
   */
  getEdgesToNode(nodeId: string): Edge[] {
    const edgeIds = this.edgesByTarget.get(nodeId) || new Set();
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id)!)
      .filter((edge) => edge !== undefined);
  }

  /**
   * Query nodes by label (keyword search)
   * Returns nodes where the label contains the query string
   */
  queryNodesByLabel(query: string): Node[] {
    const lowerQuery = query.toLowerCase();
    const results: Node[] = [];

    for (const [label, nodeIds] of this.nodesByLabel.entries()) {
      if (label.includes(lowerQuery)) {
        nodeIds.forEach((nodeId) => {
          const node = this.nodes.get(nodeId);
          if (node) results.push(node);
        });
      }
    }

    return results.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  }

  /**
   * Query nodes by type
   */
  queryNodesByType(type: NodeType): Node[] {
    return Array.from(this.nodes.values()).filter((node) => node.type === type);
  }

  /**
   * Query edges by type
   */
  queryEdgesByType(type: EdgeType): Edge[] {
    return Array.from(this.edges.values()).filter((edge) => edge.type === type);
  }

  /**
   * Get graph statistics
   */
  getStats() {
    const nodesByType = new Map<NodeType, number>();
    const edgesByType = new Map<EdgeType, number>();

    for (const node of this.nodes.values()) {
      nodesByType.set(node.type, (nodesByType.get(node.type) ?? 0) + 1);
    }

    for (const edge of this.edges.values()) {
      edgesByType.set(edge.type, (edgesByType.get(edge.type) ?? 0) + 1);
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodesByType: Object.fromEntries(nodesByType),
      edgesByType: Object.fromEntries(edgesByType),
      chatId: this.chatId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Snapshot the graph for serialization
   */
  snapshot(): GraphSnapshot {
    return {
      nodes: Object.fromEntries(this.nodes),
      edges: Object.fromEntries(this.edges),
      metadata: {
        chatId: this.chatId,
        version: this.version,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        compressionThreshold: this.compressionThreshold,
      },
    };
  }

  /**
   * Restore graph from snapshot
   */
  static fromSnapshot(snapshot: GraphSnapshot): ContextGraphManager {
    const manager = new ContextGraphManager(
      snapshot.metadata.chatId,
      snapshot.metadata.compressionThreshold
    );

    Object.values(snapshot.nodes).forEach((node) => {
      manager.addNode(node);
    });

    Object.values(snapshot.edges).forEach((edge) => {
      manager.addEdge(edge);
    });

    manager.createdAt = snapshot.metadata.createdAt;
    manager.updatedAt = snapshot.metadata.updatedAt;

    return manager;
  }

  /**
   * Get the current window size percentage
   * (Placeholder for implementation during compression task)
   */
  getContextWindowUsage(): number {
    // TODO: Implement with actual context size calculation
    return 0;
  }

  /**
   * Check if compression threshold has been reached
   */
  shouldCompress(): boolean {
    return this.getContextWindowUsage() >= this.compressionThreshold;
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getAllEdges(): Edge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
      this.nodes.clear();
      this.edges.clear();
    this.edgesBySource.clear();
    this.edgesByTarget.clear();
    this.nodesByLabel.clear();
    this.updatedAt = new Date();
  }
}

// Re-export all public APIs
export type { Node, Edge, NodeType, EdgeType, GraphSnapshot, QueryResult } from "./types";
export { PersistenceManager } from "./persistence";
export { NodeBuilder } from "./node";
export { EdgeBuilder } from "./edge";

      