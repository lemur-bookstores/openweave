import { describe, it, expect } from "vitest";
import { ContextGraphManager } from "../src/index";
import { NodeBuilder } from "../src/node";
import { EdgeBuilder } from "../src/edge";
import { NodeType, EdgeType } from "../src/types";

describe("ContextGraphManager", () => {
  it("should create a new graph", () => {
    const graph = new ContextGraphManager("test-session");
    expect(graph.getAllNodes()).toHaveLength(0);
    expect(graph.getAllEdges()).toHaveLength(0);
  });

  it("should add and retrieve a node", () => {
    const graph = new ContextGraphManager("test-session");
    const node = NodeBuilder.concept("TypeScript", "A programming language");
    
    graph.addNode(node);
    const retrieved = graph.getNode(node.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.label).toBe("TypeScript");
    expect(retrieved?.type).toBe(NodeType.CONCEPT);
  });

  it("should add different node types", () => {
    const graph = new ContextGraphManager("test-session");
    
    const concept = NodeBuilder.concept("API Design");
    const decision = NodeBuilder.decision("Use REST");
    const error = NodeBuilder.error("Wrong endpoint");
    
    graph.addNode(concept);
    graph.addNode(decision);
    graph.addNode(error);
    
    expect(graph.getAllNodes()).toHaveLength(3);
    expect(graph.queryNodesByType(NodeType.CONCEPT)).toHaveLength(1);
    expect(graph.queryNodesByType(NodeType.DECISION)).toHaveLength(1);
    expect(graph.queryNodesByType(NodeType.ERROR)).toHaveLength(1);
  });

  it("should add and retrieve an edge", () => {
    const graph = new ContextGraphManager("test-session");
    
    const concept1 = NodeBuilder.concept("Database");
    const concept2 = NodeBuilder.concept("Schema");
    
    graph.addNode(concept1);
    graph.addNode(concept2);
    
    const edge = EdgeBuilder.relates(concept1.id, concept2.id);
    graph.addEdge(edge);
    
    const retrieved = graph.getEdge(edge.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.type).toBe(EdgeType.RELATES);
  });

  it("should query nodes by label", () => {
    const graph = new ContextGraphManager("test-session");
    
    graph.addNode(NodeBuilder.concept("TypeScript"));
    graph.addNode(NodeBuilder.concept("JavaScript"));
    graph.addNode(NodeBuilder.decision("Use TypeScript"));
    
    const results = graph.queryNodesByLabel("Type");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should track edges by source and target", () => {
    const graph = new ContextGraphManager("test-session");
    
    const nodeA = NodeBuilder.concept("A");
    const nodeB = NodeBuilder.concept("B");
    const nodeC = NodeBuilder.concept("C");
    
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    
    const edge1 = EdgeBuilder.relates(nodeA.id, nodeB.id);
    const edge2 = EdgeBuilder.causes(nodeA.id, nodeC.id);
    
    graph.addEdge(edge1);
    graph.addEdge(edge2);
    
    const fromA = graph.getEdgesFromNode(nodeA.id);
    expect(fromA).toHaveLength(2);
    
    const toB = graph.getEdgesToNode(nodeB.id);
    expect(toB).toHaveLength(1);
  });

  it("should update a node", () => {
    const graph = new ContextGraphManager("test-session");
    const node = NodeBuilder.concept("Original");
    
    graph.addNode(node);
    const updated = graph.updateNode(node.id, {
      label: "Updated",
      frequency: 5,
    });
    
    expect(updated?.label).toBe("Updated");
    expect(updated?.frequency).toBe(5);
  });

  it("should delete a node and its edges", () => {
    const graph = new ContextGraphManager("test-session");
    
    const nodeA = NodeBuilder.concept("A");
    const nodeB = NodeBuilder.concept("B");
    
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    
    const edge = EdgeBuilder.relates(nodeA.id, nodeB.id);
    graph.addEdge(edge);
    
    graph.deleteNode(nodeA.id);
    
    expect(graph.getNode(nodeA.id)).toBeUndefined();
    expect(graph.getAllEdges()).toHaveLength(0);
  });

  it("should generate graph stats", () => {
    const graph = new ContextGraphManager("test-session");
    
    graph.addNode(NodeBuilder.concept("C1"));
    graph.addNode(NodeBuilder.decision("D1"));
    
    const node1 = graph.getAllNodes()[0];
    const node2 = graph.getAllNodes()[1];
    
    graph.addEdge(EdgeBuilder.relates(node1!.id, node2!.id));
    
    const stats = graph.getStats();
    
    expect(stats.totalNodes).toBe(2);
    expect(stats.totalEdges).toBe(1);
  });

  it("should snapshot and restore graph", () => {
    const graph = new ContextGraphManager("test-session");
    
    const node = NodeBuilder.decision("Use PostgreSQL");
    graph.addNode(node);
    
    const snapshot = graph.snapshot();
    expect(snapshot.metadata.chatId).toBe("test-session");
    expect(Object.keys(snapshot.nodes)).toHaveLength(1);
    
    const restored = ContextGraphManager.fromSnapshot(snapshot);
    expect(restored.getAllNodes()).toHaveLength(1);
    expect(restored.getAllNodes()[0]?.label).toBe("Use PostgreSQL");
  });
});
