import { describe, it, expect, beforeEach } from "vitest";
import {
  tokenize,
  jaccardSimilarity,
  SynapticEngine,
  SynapticGraph,
} from "./synaptic-engine.js";
import { ContextGraphManager } from "./index.js";
import { NodeBuilder } from "./node.js";
import { Edge, Node } from "./types.js";

// ---------------------------------------------------------------------------
// Minimal fake graph that satisfies SynapticGraph (no circular dep with index)
// ---------------------------------------------------------------------------

class FakeGraph implements SynapticGraph {
  private _nodes: Map<string, Node> = new Map();
  private _edges: Map<string, Edge> = new Map();

  seed(node: Node): void {
    this._nodes.set(node.id, node);
  }

  getAllNodes(): Node[] {
    return Array.from(this._nodes.values());
  }

  addEdge(edge: Edge): Edge {
    this._edges.set(edge.id, edge);
    return edge;
  }

  getEdges(): Edge[] {
    return Array.from(this._edges.values());
  }
}

// ---------------------------------------------------------------------------
// tokenize()
// ---------------------------------------------------------------------------

describe("tokenize()", () => {
  it("returns a set of lowercase tokens", () => {
    const tokens = tokenize("TypeScript generics");
    // "TypeScript" is camelCase → split into "type" + "script"
    expect(tokens.has("type")).toBe(true);
    expect(tokens.has("script")).toBe(true);
    expect(tokens.has("generics")).toBe(true);
  });

  it("splits camelCase boundaries", () => {
    const tokens = tokenize("useContextManager");
    expect(tokens.has("context")).toBe(true);
    expect(tokens.has("manager")).toBe(true);
  });

  it("splits PascalCase boundaries", () => {
    const tokens = tokenize("WeaveGraph");
    expect(tokens.has("weave")).toBe(true);
    expect(tokens.has("graph")).toBe(true);
  });

  it("removes stop-words", () => {
    const tokens = tokenize("a connection to the graph");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("to")).toBe(false);
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("connection")).toBe(true);
    expect(tokens.has("graph")).toBe(true);
  });

  it("filters tokens shorter than 2 chars", () => {
    const tokens = tokenize("x y abc");
    expect(tokens.has("x")).toBe(false);
    expect(tokens.has("y")).toBe(false);
    expect(tokens.has("abc")).toBe(true);
  });

  it("handles punctuation separators", () => {
    const tokens = tokenize("node.edge-graph/path");
    expect(tokens.has("node")).toBe(true);
    expect(tokens.has("edge")).toBe(true);
    expect(tokens.has("graph")).toBe(true);
    expect(tokens.has("path")).toBe(true);
  });

  it("returns empty set for stop-word-only input", () => {
    const tokens = tokenize("a the and or");
    expect(tokens.size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    expect(tokenize("").size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity()
// ---------------------------------------------------------------------------

describe("jaccardSimilarity()", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["typescript", "generics"]);
    const b = new Set(["typescript", "generics"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0.0 for completely disjoint sets", () => {
    const a = new Set(["typescript", "generics"]);
    const b = new Set(["python", "decorators"]);
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });

  it("returns correct ratio for partial overlap", () => {
    // A={a,b,c}, B={b,c,d} → intersection=2, union=4 → 0.5
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });

  it("returns 0 when both sets are empty", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns 0 when one set is empty", () => {
    const a = new Set(["typescript"]);
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SynapticEngine — configuration
// ---------------------------------------------------------------------------

describe("SynapticEngine — config", () => {
  it("applies default threshold and maxConnections", () => {
    const engine = new SynapticEngine();
    expect(engine.config.threshold).toBe(0.72);
    expect(engine.config.maxConnections).toBe(20);
  });

  it("accepts custom threshold and maxConnections", () => {
    const engine = new SynapticEngine({ threshold: 0.5, maxConnections: 5 });
    expect(engine.config.threshold).toBe(0.5);
    expect(engine.config.maxConnections).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// SynapticEngine — linkRetroactively()
// ---------------------------------------------------------------------------

describe("SynapticEngine — linkRetroactively()", () => {
  let engine: SynapticEngine;
  let graph: FakeGraph;

  beforeEach(() => {
    engine = new SynapticEngine({ threshold: 0.3, maxConnections: 20 });
    graph = new FakeGraph();
  });

  it("returns empty array when graph has no existing nodes", () => {
    const newNode = NodeBuilder.concept("TypeScript generics", "Parametric polymorphism");
    graph.seed(newNode);
    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges).toHaveLength(0);
  });

  it("creates a synaptic edge between similar nodes", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic type constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("TypeScript generic constraints", "extends keyword");
    graph.seed(newNode);

    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].sourceId).toBe(newNode.id);
    expect(edges[0].targetId).toBe(existing.id);
  });

  it("does not create an edge to itself", () => {
    const node = NodeBuilder.concept("TypeScript generics", "Parametric types");
    graph.seed(node);

    const edges = engine.linkRetroactively(node, graph);
    const selfEdge = edges.find((e) => e.targetId === node.id);
    expect(selfEdge).toBeUndefined();
  });

  it("sets metadata.synapse = true on created edges", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("Generic TypeScript types", "Type parameters");
    graph.seed(newNode);

    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].metadata?.synapse).toBe(true);
  });

  it("stores similarity score in edge weight and metadata", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("Generic TypeScript types", "Type parameters");
    graph.seed(newNode);

    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges.length).toBeGreaterThan(0);
    const edge = edges[0];
    expect(edge.weight).toBeGreaterThanOrEqual(0.3);
    expect(edge.metadata?.similarity).toBe(edge.weight);
  });

  it("does not create edges below the threshold", () => {
    const highEngine = new SynapticEngine({ threshold: 0.99, maxConnections: 20 });
    const existing = NodeBuilder.concept("Python decorators", "Metaclass patterns");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(newNode);

    const edges = highEngine.linkRetroactively(newNode, graph);
    expect(edges).toHaveLength(0);
  });

  it("respects maxConnections limit", () => {
    const limitedEngine = new SynapticEngine({ threshold: 0.1, maxConnections: 2 });

    // Seed 5 similar nodes
    for (let i = 0; i < 5; i++) {
      graph.seed(NodeBuilder.concept(`TypeScript generic type ${i}`, "Generic constraints"));
    }

    const newNode = NodeBuilder.concept("TypeScript generic types", "Type parameters");
    graph.seed(newNode);

    const edges = limitedEngine.linkRetroactively(newNode, graph);
    expect(edges.length).toBeLessThanOrEqual(2);
  });

  it("selects highest-similarity candidates when capped by maxConnections", () => {
    const limitedEngine = new SynapticEngine({ threshold: 0.1, maxConnections: 1 });

    const lowSim = NodeBuilder.concept("TypeScript", "A language"); // lower overlap
    const highSim = NodeBuilder.concept("TypeScript generics constraints", "Generic type parameters"); // higher overlap
    graph.seed(lowSim);
    graph.seed(highSim);

    const newNode = NodeBuilder.concept("TypeScript generic constraints", "Type parameter bounds");
    graph.seed(newNode);

    const edges = limitedEngine.linkRetroactively(newNode, graph);
    expect(edges).toHaveLength(1);
    // The selected edge should be the highest-similarity one
    expect(edges[0].targetId).toBe(highSim.id);
  });

  it("adds created edges to the graph", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("Generic TypeScript types", "Type parameters");
    graph.seed(newNode);

    engine.linkRetroactively(newNode, graph);
    expect(graph.getEdges().length).toBeGreaterThan(0);
  });

  it("returns empty array when newNode tokens are all stop-words", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("a the and", "using or");
    graph.seed(newNode);

    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges).toHaveLength(0);
  });

  it("handles multiple existing nodes, creating edges to all qualifying ones", () => {
    const nodeA = NodeBuilder.concept("TypeScript generics", "Generic type constraints");
    const nodeB = NodeBuilder.concept("TypeScript type system", "Type inference");
    const nodeC = NodeBuilder.concept("Python asyncio", "Async event loop");
    graph.seed(nodeA);
    graph.seed(nodeB);
    graph.seed(nodeC);

    const newNode = NodeBuilder.concept("TypeScript generic type inference", "Type system");
    graph.seed(newNode);

    const multiEngine = new SynapticEngine({ threshold: 0.1, maxConnections: 20 });
    const edges = multiEngine.linkRetroactively(newNode, graph);

    const targetIds = edges.map((e) => e.targetId);
    // Should link to TypeScript-related nodes but likely not Python/asyncio
    expect(targetIds).toContain(nodeA.id);
    expect(targetIds).toContain(nodeB.id);
    expect(targetIds).not.toContain(nodeC.id);
  });

  it("edges are of type RELATES", () => {
    const existing = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.seed(existing);

    const newNode = NodeBuilder.concept("Generic TypeScript types", "Type parameters");
    graph.seed(newNode);

    const edges = engine.linkRetroactively(newNode, graph);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].type).toBe("RELATES");
  });
});

// ---------------------------------------------------------------------------
// Integration — ContextGraphManager.setSynapticEngine()
// ---------------------------------------------------------------------------

describe("ContextGraphManager + SynapticEngine integration", () => {
  it("addNode() triggers retroactive linking when engine is attached", () => {
    const graph = new ContextGraphManager("test-session");
    const engine = new SynapticEngine({ threshold: 0.2, maxConnections: 20 });
    graph.setSynapticEngine(engine);

    // Add a historical node
    graph.addNode(NodeBuilder.concept("TypeScript generics", "Generic type constraints"));

    // Add a related node — should auto-create a synaptic edge
    graph.addNode(NodeBuilder.concept("TypeScript generic types", "Type parameter bounds"));

    const edges = graph.getAllEdges();
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.some((e) => e.metadata?.synapse === true)).toBe(true);
  });

  it("addNode() does NOT trigger linking when no engine attached", () => {
    const graph = new ContextGraphManager("test-no-engine");

    graph.addNode(NodeBuilder.concept("TypeScript generics", "Generic constraints"));
    graph.addNode(NodeBuilder.concept("TypeScript generic types", "Type parameters"));

    // No engine → no automatic edges
    expect(graph.getAllEdges()).toHaveLength(0);
  });

  it("synaptic edges reference the correct source and target node ids", () => {
    const graph = new ContextGraphManager("test-ids");
    const engine = new SynapticEngine({ threshold: 0.2, maxConnections: 20 });
    graph.setSynapticEngine(engine);

    const historical = NodeBuilder.concept("TypeScript generics", "Generic constraints");
    graph.addNode(historical);

    const newer = NodeBuilder.concept("TypeScript generic constraints", "Type bounds");
    graph.addNode(newer);

    const synapticEdges = graph.getAllEdges().filter((e) => e.metadata?.synapse);
    expect(synapticEdges.length).toBeGreaterThan(0);
    expect(synapticEdges[0].sourceId).toBe(newer.id);
    expect(synapticEdges[0].targetId).toBe(historical.id);
  });

  it("does not create edges when new node has no token overlap with existing nodes", () => {
    const graph = new ContextGraphManager("test-no-overlap");
    const engine = new SynapticEngine({ threshold: 0.5, maxConnections: 20 });
    graph.setSynapticEngine(engine);

    graph.addNode(NodeBuilder.concept("Python asyncio", "Event loop patterns"));
    graph.addNode(NodeBuilder.concept("TypeScript decorators", "Class metadata"));

    expect(graph.getAllEdges()).toHaveLength(0);
  });
});
