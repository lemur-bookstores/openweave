import { describe, it, expect, beforeEach } from "vitest";
import { HebbianWeights, HebbianGraph } from "./hebbian-weights.js";
import { ContextGraphManager } from "./index.js";
import { NodeBuilder } from "./node.js";
import { EdgeBuilder } from "./edge.js";
import { Edge, NodeType } from "./types.js";

// ---------------------------------------------------------------------------
// Minimal fake graph satisfying HebbianGraph
// ---------------------------------------------------------------------------

class FakeGraph implements HebbianGraph {
  private _edges: Map<string, Edge> = new Map();

  seedEdge(edge: Edge): void {
    this._edges.set(edge.id, edge);
  }

  getEdge(edgeId: string): Edge | undefined {
    return this._edges.get(edgeId);
  }

  updateEdge(edgeId: string, updates: Partial<Edge>): Edge | undefined {
    const edge = this._edges.get(edgeId);
    if (!edge) return undefined;
    const updated = { ...edge, ...updates };
    this._edges.set(edgeId, updated);
    return updated;
  }

  getAllEdges(): Edge[] {
    return Array.from(this._edges.values());
  }

  deleteEdge(edgeId: string): boolean {
    return this._edges.delete(edgeId);
  }
}

// ---------------------------------------------------------------------------
// HebbianWeights — configuration
// ---------------------------------------------------------------------------

describe("HebbianWeights — config", () => {
  it("applies default values", () => {
    const hw = new HebbianWeights();
    expect(hw.config.hebbianStrength).toBe(0.1);
    expect(hw.config.decayRate).toBe(0.99);
    expect(hw.config.pruneThreshold).toBe(0.05);
    expect(hw.config.maxWeight).toBe(5.0);
  });

  it("accepts custom values", () => {
    const hw = new HebbianWeights({
      hebbianStrength: 0.2,
      decayRate: 0.95,
      pruneThreshold: 0.1,
      maxWeight: 3.0,
    });
    expect(hw.config.hebbianStrength).toBe(0.2);
    expect(hw.config.decayRate).toBe(0.95);
    expect(hw.config.pruneThreshold).toBe(0.1);
    expect(hw.config.maxWeight).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// strengthen()
// ---------------------------------------------------------------------------

describe("HebbianWeights — strengthen()", () => {
  let hw: HebbianWeights;
  let graph: FakeGraph;

  beforeEach(() => {
    hw = new HebbianWeights({ hebbianStrength: 0.1, maxWeight: 5.0 });
    graph = new FakeGraph();
  });

  it("increases edge weight by hebbianStrength", () => {
    const edge = EdgeBuilder.relates("a", "b", 1.0);
    graph.seedEdge(edge);

    const updated = hw.strengthen(edge.id, graph);
    expect(updated?.weight).toBeCloseTo(1.1);
  });

  it("does not exceed maxWeight", () => {
    const edge = EdgeBuilder.relates("a", "b", 4.95);
    graph.seedEdge(edge);

    const updated = hw.strengthen(edge.id, graph);
    expect(updated?.weight).toBe(5.0);
  });

  it("returns undefined for non-existent edge id", () => {
    expect(hw.strengthen("non-existent", graph)).toBeUndefined();
  });

  it("treats missing weight as 1.0 baseline", () => {
    const edge: Edge = {
      ...EdgeBuilder.relates("a", "b"),
      weight: undefined,
    };
    graph.seedEdge(edge);

    const updated = hw.strengthen(edge.id, graph);
    expect(updated?.weight).toBeCloseTo(1.1);
  });

  it("can be called multiple times cumulatively", () => {
    const edge = EdgeBuilder.relates("a", "b", 1.0);
    graph.seedEdge(edge);

    hw.strengthen(edge.id, graph);
    hw.strengthen(edge.id, graph);
    const updated = hw.strengthen(edge.id, graph);
    expect(updated?.weight).toBeCloseTo(1.3);
  });
});

// ---------------------------------------------------------------------------
// strengthenCoActivated()
// ---------------------------------------------------------------------------

describe("HebbianWeights — strengthenCoActivated()", () => {
  let hw: HebbianWeights;
  let graph: FakeGraph;

  beforeEach(() => {
    hw = new HebbianWeights({ hebbianStrength: 0.1 });
    graph = new FakeGraph();
  });

  it("returns empty array when fewer than 2 nodes", () => {
    expect(hw.strengthenCoActivated([], graph)).toHaveLength(0);
    expect(hw.strengthenCoActivated(["only-one"], graph)).toHaveLength(0);
  });

  it("strengthens edges between co-activated nodes", () => {
    const e = EdgeBuilder.relates("node-a", "node-b", 1.0);
    graph.seedEdge(e);

    const ids = hw.strengthenCoActivated(["node-a", "node-b"], graph);
    expect(ids).toContain(e.id);
    expect(graph.getEdge(e.id)?.weight).toBeCloseTo(1.1);
  });

  it("does not strengthen edges to nodes outside the result set", () => {
    const inSet = EdgeBuilder.relates("node-a", "node-b", 1.0);
    const outSet = EdgeBuilder.relates("node-a", "node-c", 1.0);
    graph.seedEdge(inSet);
    graph.seedEdge(outSet);

    hw.strengthenCoActivated(["node-a", "node-b"], graph);

    expect(graph.getEdge(inSet.id)?.weight).toBeCloseTo(1.1);
    expect(graph.getEdge(outSet.id)?.weight).toBeCloseTo(1.0); // unchanged
  });

  it("strengthens multiple edges in a clique of 3 nodes", () => {
    const eAB = EdgeBuilder.relates("a", "b", 1.0);
    const eBC = EdgeBuilder.relates("b", "c", 1.0);
    const eAC = EdgeBuilder.relates("a", "c", 1.0);
    graph.seedEdge(eAB);
    graph.seedEdge(eBC);
    graph.seedEdge(eAC);

    const ids = hw.strengthenCoActivated(["a", "b", "c"], graph);
    expect(ids).toHaveLength(3);
    expect(graph.getEdge(eAB.id)?.weight).toBeCloseTo(1.1);
    expect(graph.getEdge(eBC.id)?.weight).toBeCloseTo(1.1);
    expect(graph.getEdge(eAC.id)?.weight).toBeCloseTo(1.1);
  });
});

// ---------------------------------------------------------------------------
// decay()
// ---------------------------------------------------------------------------

describe("HebbianWeights — decay()", () => {
  let hw: HebbianWeights;
  let graph: FakeGraph;

  beforeEach(() => {
    hw = new HebbianWeights({ decayRate: 0.99 });
    graph = new FakeGraph();
  });

  it("returns the count of edges decayed", () => {
    graph.seedEdge(EdgeBuilder.relates("a", "b", 1.0));
    graph.seedEdge(EdgeBuilder.relates("b", "c", 2.0));

    expect(hw.decay(graph)).toBe(2);
  });

  it("multiplies each edge weight by decayRate", () => {
    const edge = EdgeBuilder.relates("a", "b", 1.0);
    graph.seedEdge(edge);

    hw.decay(graph);
    expect(graph.getEdge(edge.id)?.weight).toBeCloseTo(0.99);
  });

  it("returns 0 when graph has no edges", () => {
    expect(hw.decay(graph)).toBe(0);
  });

  it("progressively weakens weight over multiple cycles", () => {
    const edge = EdgeBuilder.relates("a", "b", 1.0);
    graph.seedEdge(edge);

    hw.decay(graph);
    hw.decay(graph);
    hw.decay(graph);
    // 1.0 × 0.99³ ≈ 0.9703
    expect(graph.getEdge(edge.id)?.weight).toBeCloseTo(0.9703, 3);
  });

  it("treats missing weight as 1.0 before decaying", () => {
    const edge: Edge = { ...EdgeBuilder.relates("a", "b"), weight: undefined };
    graph.seedEdge(edge);

    hw.decay(graph);
    expect(graph.getEdge(edge.id)?.weight).toBeCloseTo(0.99);
  });
});

// ---------------------------------------------------------------------------
// prune()
// ---------------------------------------------------------------------------

describe("HebbianWeights — prune()", () => {
  let hw: HebbianWeights;
  let graph: FakeGraph;

  beforeEach(() => {
    hw = new HebbianWeights({ pruneThreshold: 0.05 });
    graph = new FakeGraph();
  });

  it("returns 0 when no edges fall below threshold", () => {
    graph.seedEdge(EdgeBuilder.relates("a", "b", 1.0));
    expect(hw.prune(graph)).toBe(0);
  });

  it("deletes edges below pruneThreshold", () => {
    const weak = EdgeBuilder.relates("a", "b", 0.03);
    const strong = EdgeBuilder.relates("b", "c", 1.0);
    graph.seedEdge(weak);
    graph.seedEdge(strong);

    const count = hw.prune(graph);
    expect(count).toBe(1);
    expect(graph.getEdge(weak.id)).toBeUndefined();
    expect(graph.getEdge(strong.id)).toBeDefined();
  });

  it("accepts a custom minWeight override", () => {
    const edge = EdgeBuilder.relates("a", "b", 0.5);
    graph.seedEdge(edge);

    const count = hw.prune(graph, 0.6);
    expect(count).toBe(1);
    expect(graph.getEdge(edge.id)).toBeUndefined();
  });

  it("does not delete edge exactly at threshold (strict less-than)", () => {
    const edge = EdgeBuilder.relates("a", "b", 0.05);
    graph.seedEdge(edge);

    expect(hw.prune(graph)).toBe(0);
    expect(graph.getEdge(edge.id)).toBeDefined();
  });

  it("returns count of all pruned edges", () => {
    graph.seedEdge(EdgeBuilder.relates("a", "b", 0.01));
    graph.seedEdge(EdgeBuilder.relates("b", "c", 0.02));
    graph.seedEdge(EdgeBuilder.relates("c", "d", 1.00));

    expect(hw.prune(graph)).toBe(2);
    expect(graph.getAllEdges()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration — ContextGraphManager.setHebbianWeights()
// ---------------------------------------------------------------------------

describe("ContextGraphManager + HebbianWeights integration", () => {
  it("queryNodesByLabel() auto-strengthens co-activated edges", () => {
    const graph = new ContextGraphManager("test-hebbian");
    const hw = new HebbianWeights({ hebbianStrength: 0.1 });
    graph.setHebbianWeights(hw);

    const nodeA = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    const nodeB = NodeBuilder.concept("TypeScript generic types", "Type parameters");
    graph.addNode(nodeA);
    graph.addNode(nodeB);

    // Manually add an edge between them
    const edge = EdgeBuilder.relates(nodeA.id, nodeB.id, 1.0);
    graph.addEdge(edge);

    // Query that returns both nodes → edge should be strengthened
    graph.queryNodesByLabel("TypeScript");

    const updated = graph.getEdge(edge.id);
    expect(updated?.weight).toBeGreaterThan(1.0);
  });

  it("queryNodesByLabel() does NOT strengthen when no HebbianWeights attached", () => {
    const graph = new ContextGraphManager("test-no-hebbian");

    const nodeA = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    const nodeB = NodeBuilder.concept("TypeScript generic types", "Type parameters");
    graph.addNode(nodeA);
    graph.addNode(nodeB);

    const edge = EdgeBuilder.relates(nodeA.id, nodeB.id, 1.0);
    graph.addEdge(edge);

    graph.queryNodesByLabel("TypeScript");

    expect(graph.getEdge(edge.id)?.weight).toBe(1.0); // unchanged
  });

  it("queryNodesByType() auto-strengthens co-activated edges", () => {
    const graph = new ContextGraphManager("test-hebbian-type");
    const hw = new HebbianWeights({ hebbianStrength: 0.1 });
    graph.setHebbianWeights(hw);

    const nodeA = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    const nodeB = NodeBuilder.concept("TypeScript generic types", "Type parameters");
    graph.addNode(nodeA);
    graph.addNode(nodeB);

    const edge = EdgeBuilder.relates(nodeA.id, nodeB.id, 1.0);
    graph.addEdge(edge);

    // Both nodes are CONCEPT type → query returns both → edge strengthened
    graph.queryNodesByType(NodeType.CONCEPT);

    const updated = graph.getEdge(edge.id);
    expect(updated?.weight).toBeGreaterThan(1.0);
  });

  it("decay() and prune() interact correctly via ContextGraphManager", () => {
    const graph = new ContextGraphManager("test-decay-prune");
    const hw = new HebbianWeights({ decayRate: 0.1, pruneThreshold: 0.5 });
    graph.setHebbianWeights(hw);

    graph.addNode(NodeBuilder.concept("TypeScript", "Language"));
    graph.addNode(NodeBuilder.concept("JavaScript", "Language"));

    const edge = EdgeBuilder.relates(
      graph.getAllNodes()[0].id,
      graph.getAllNodes()[1].id,
      1.0
    );
    graph.addEdge(edge);

    // Decay heavily → 1.0 × 0.1 = 0.1 < 0.5
    hw.decay(graph);
    const pruned = hw.prune(graph);

    expect(pruned).toBe(1);
    expect(graph.getAllEdges()).toHaveLength(0);
  });
});
