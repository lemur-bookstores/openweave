import { describe, it, expect } from "vitest";
import { CompressionManager, ErrorSuppression } from "../src/compression";
import { ContextGraphManager } from "../src/index";
import { NodeBuilder } from "../src/node";
import { EdgeBuilder } from "../src/edge";

describe("CompressionManager", () => {
  it("should estimate node size correctly", () => {
    const node = NodeBuilder.concept("Test", "A test concept with description");
    const size = CompressionManager.estimateNodeSize(node);

    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(500); // Should be reasonable size
  });

  it("should estimate edge size correctly", () => {
    const edge = EdgeBuilder.relates("node1", "node2");
    const size = CompressionManager.estimateEdgeSize(edge);

    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(500);
  });

  it("should calculate total context size", () => {
    const nodes = [
      NodeBuilder.concept("Node 1", "Description 1"),
      NodeBuilder.concept("Node 2", "Description 2"),
      NodeBuilder.decision("Decision 1", "Long description for the decision node"),
    ];

    const edges = [
      EdgeBuilder.relates(nodes[0].id, nodes[1].id),
      EdgeBuilder.causes(nodes[1].id, nodes[2].id),
    ];

    const contextSize = CompressionManager.calculateContextSize(nodes, edges);
    expect(contextSize).toBeGreaterThan(0);
  });

  it("should calculate context usage percentage", () => {
    const usage1 = CompressionManager.calculateContextUsagePercentage(50_000);
    expect(usage1).toBeLessThan(1);
    expect(usage1).toBeGreaterThan(0);

    const usage2 = CompressionManager.calculateContextUsagePercentage(500_000);
    expect(usage2).toBe(1); // Should be capped at 1
  });

  it("should identify archive candidates", () => {
    const nodes = [
      NodeBuilder.concept("Frequent Node", "Used often"),
      NodeBuilder.concept("Rare Node", "Barely used"),
      NodeBuilder.error("Old Error", "Should be archived"),
    ];

    const edges = [EdgeBuilder.relates(nodes[0].id, nodes[1].id)];

    // Increase frequency of first node
    nodes[0].frequency = 10;
    nodes[1].frequency = 1;
    nodes[2].frequency = 1;

    const candidates = CompressionManager.identifyArchiveCandidates(nodes, edges, 0.67); // Archive 2/3

    expect(candidates.length).toBeGreaterThan(0);
    // Should archive something since we requested 67% reduction
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("should prioritize high-connection nodes", () => {
    const hub = NodeBuilder.concept("Hub Node");
    const peripheral1 = NodeBuilder.concept("Peripheral 1");
    const peripheral2 = NodeBuilder.concept("Peripheral 2");

    const nodes = [hub, peripheral1, peripheral2];
    const edges = [
      EdgeBuilder.relates(hub.id, peripheral1.id),
      EdgeBuilder.relates(hub.id, peripheral2.id),
    ];

    hub.frequency = 1;
    peripheral1.frequency = 1;
    peripheral2.frequency = 1;

    const candidates = CompressionManager.identifyArchiveCandidates(nodes, edges, 0.33);

    // Hub should NOT be archived (has 2 connections)
    expect(candidates).not.toContain(hub.id);
  });

  it("should archive and restore nodes", () => {
    const node1 = NodeBuilder.concept("Node 1");
    const node2 = NodeBuilder.concept("Node 2");
    const edge = EdgeBuilder.relates(node1.id, node2.id);

    const nodes = new Map([
      [node1.id, node1],
      [node2.id, node2],
    ]);

    const edges = new Map([[edge.id, edge]]);

    const mgr = new CompressionManager();
    mgr.archiveNodes([node1.id], nodes, edges);

    const stats = mgr.getArchiveStats();
    expect(stats.archivedNodeCount).toBe(1);
    expect(stats.archivedEdgeCount).toBe(1);

    const restored = mgr.restoreNodes([node1.id]);
    expect(restored.size).toBe(1);
    expect(restored.get(node1.id)).toBeDefined();
  });
});

describe("ErrorSuppression", () => {
  it("should suppress an error node", () => {
    const errorNode = NodeBuilder.error("Wrong implementation");
    const suppressed = ErrorSuppression.suppressNode(errorNode);

    expect(ErrorSuppression.isSuppressed(suppressed)).toBe(true);
    expect(suppressed.metadata?.suppressed).toBe(true);
  });

  it("should throw when suppressing non-error node", () => {
    const conceptNode = NodeBuilder.concept("Not an error");

    expect(() => {
      ErrorSuppression.suppressNode(conceptNode);
    }).toThrow("Only ERROR type nodes can be suppressed");
  });

  it("should create correction for error", () => {
    const error = NodeBuilder.error("Wrong approach");
    const { correctionNode, correctionEdge } = ErrorSuppression.createCorrection(
      error.id,
      "Correct approach",
      "Use this instead"
    );

    expect(correctionNode.type).toBe("CORRECTION");
    expect(correctionNode.label).toBe("Correct approach");
    expect(correctionEdge.type).toBe("CORRECTS");
    expect(correctionEdge.sourceId).toBe(correctionNode.id);
    expect(correctionEdge.targetId).toBe(error.id);
  });

  it("should find corrected errors", () => {
    const error = NodeBuilder.error("Error 1");
    const correction = NodeBuilder.correction("Correction 1");
    const correctionEdge = EdgeBuilder.corrects(correction.id, error.id);

    const nodes = new Map([
      [error.id, error],
      [correction.id, correction],
    ]);

    const edges = new Map([[correctionEdge.id, correctionEdge]]);

    const corrected = ErrorSuppression.findCorrectedErrors(nodes, edges);

    expect(corrected.has(error.id)).toBe(true);
    const entry = corrected.get(error.id)!;
    expect(entry.corrections).toContain(correction);
  });

  it("should find uncorrected errors", () => {
    const error1 = NodeBuilder.error("Uncorrected error");
    const error2 = NodeBuilder.error("Corrected error");
    const correction = NodeBuilder.correction("Correction for error2");
    const correctionEdge = EdgeBuilder.corrects(correction.id, error2.id);

    const nodes = new Map([
      [error1.id, error1],
      [error2.id, error2],
      [correction.id, correction],
    ]);

    const edges = new Map([[correctionEdge.id, correctionEdge]]);

    const uncorrected = ErrorSuppression.findUncorrectedErrors(nodes, edges);

    expect(uncorrected).toHaveLength(1);
    expect(uncorrected[0]).toBe(error1);
  });
});

describe("ContextGraphManager - Compression Integration", () => {
  it("should calculate context window usage", () => {
    const graph = new ContextGraphManager("test-session");

    graph.addNode(NodeBuilder.concept("Node 1"));
    graph.addNode(NodeBuilder.concept("Node 2"));

    const usage = graph.getContextWindowUsage();
    expect(usage).toBeGreaterThanOrEqual(0);
    expect(usage).toBeLessThanOrEqual(1);
  });

  it("should get context size in bytes", () => {
    const graph = new ContextGraphManager("test-session");

    graph.addNode(NodeBuilder.concept("Test node", "With description"));
    const size = graph.getContextSize();

    expect(size).toBeGreaterThan(0);
  });

  it("should detect when compression is needed", () => {
    const graph = new ContextGraphManager("test-session", 0.05); // Very low threshold for testing (5%)

    // Add nodes with longer descriptions to increase context size
    const longDesc = "A ".repeat(500); // ~1000 bytes per description
    for (let i = 0; i < 20; i++) {
      graph.addNode(NodeBuilder.concept(`Concept ${i}`, longDesc));
    }

    const shouldCompress = graph.shouldCompress();
    // With 20 nodes with long descriptions and 5% threshold, should need compression
    expect(shouldCompress).toBe(true);
  });

  it("should suppress error and create correction", () => {
    const graph = new ContextGraphManager("test-session");

    const errorNode = NodeBuilder.error("Wrong approach");
    graph.addNode(errorNode);

    const result = graph.suppressError(errorNode.id, "Correct approach", "Better solution");

    expect(result.correctionNode.type).toBe("CORRECTION");
    expect(result.correctionEdge.type).toBe("CORRECTS");

    const retrievedError = graph.getNode(errorNode.id);
    expect(retrievedError?.metadata?.suppressed).toBe(true);

    const retrievedCorrection = graph.getNode(result.correctionNode.id);
    expect(retrievedCorrection).toBeDefined();
  });

  it("should get corrected errors", () => {
    const graph = new ContextGraphManager("test-session");

    const error1 = NodeBuilder.error("Error 1");
    const error2 = NodeBuilder.error("Error 2");

    graph.addNode(error1);
    graph.addNode(error2);

    // Suppress error1 and create correction
    graph.suppressError(error1.id, "Correction 1");

    // Leave error2 uncorrected

    const corrected = graph.getCorrectedErrors();
    expect(corrected.has(error1.id)).toBe(true);

    const uncorrected = graph.getUncorrectedErrors();
    expect(uncorrected).toHaveLength(1);
    expect(uncorrected[0]).toBe(error2);
  });

  it("should throw error if trying to suppress non-error node", () => {
    const graph = new ContextGraphManager("test-session");

    const conceptNode = NodeBuilder.concept("Not an error");
    graph.addNode(conceptNode);

    expect(() => {
      graph.suppressError(conceptNode.id, "Correction");
    }).toThrow("Node must be an ERROR type");
  });
});
