import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PersistenceManager } from "../src/persistence";
import { ContextGraphManager } from "../src/index";
import { NodeBuilder } from "../src/node";
import { EdgeBuilder } from "../src/edge";
import { promises as fs } from "fs";
import * as path from "path";
import os from "os";

// Use system temp directory for test data to avoid path issues
const testDataDir = path.join(os.tmpdir(), `weave-graph-test-${Date.now()}`);

describe("PersistenceManager", () => {
  let persistenceManager: PersistenceManager;

  beforeEach(() => {
    persistenceManager = new PersistenceManager(testDataDir);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should create data directory if it doesn't exist", async () => {
    await persistenceManager.ensureDataDir();
    const stat = await fs.stat(testDataDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("should save a graph snapshot", async () => {
    const graph = new ContextGraphManager("test-session");
    graph.addNode(NodeBuilder.concept("Test Concept"));

    const snapshot = graph.snapshot();
    await persistenceManager.saveGraph(snapshot);

    const filePath = path.join(testDataDir, "test_session.json");
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for I/O
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBeDefined();

    const parsed = JSON.parse(content);
    expect(parsed.metadata.chatId).toBe("test-session");
  });

  it("should load a saved graph snapshot", async () => {
    const graph1 = new ContextGraphManager("load-test");
    const node = NodeBuilder.decision("Use TypeScript");
    graph1.addNode(node);

    const snapshot1 = graph1.snapshot();
    await persistenceManager.saveGraph(snapshot1);

    const snapshot2 = await persistenceManager.loadGraph("load-test");
    expect(snapshot2).toBeDefined();
    expect(snapshot2?.metadata.chatId).toBe("load-test");
    expect(Object.keys(snapshot2?.nodes ?? {})).toHaveLength(1);
  });

  it("should return null for non-existent graph", async () => {
    const snapshot = await persistenceManager.loadGraph("non-existent");
    expect(snapshot).toBeNull();
  });

  it("should check if graph exists", async () => {
    const graph = new ContextGraphManager("exists-test");
    graph.addNode(NodeBuilder.concept("Test"));

    await persistenceManager.saveGraph(graph.snapshot());
    const exists = await persistenceManager.graphExists("exists-test");
    expect(exists).toBe(true);

    const notExists = await persistenceManager.graphExists("non-existent");
    expect(notExists).toBe(false);
  });

  it("should load or create graph", async () => {
    const graph1 = await persistenceManager.loadOrCreateGraph("new-session");
    expect(graph1.getAllNodes()).toHaveLength(0);

    graph1.addNode(NodeBuilder.concept("First Concept"));
    await persistenceManager.saveGraph(graph1.snapshot());

    const graph2 = await persistenceManager.loadOrCreateGraph("new-session");
    expect(graph2.getAllNodes()).toHaveLength(1);
  });

  it("should delete a graph", async () => {
    const graph = new ContextGraphManager("delete-test");
    graph.addNode(NodeBuilder.concept("To Delete"));

    await persistenceManager.saveGraph(graph.snapshot());
    let exists = await persistenceManager.graphExists("delete-test");
    expect(exists).toBe(true);

    await persistenceManager.deleteGraph("delete-test");
    exists = await persistenceManager.graphExists("delete-test");
    expect(exists).toBe(false);
  });

  it("should list all sessions", async () => {
    const graph1 = new ContextGraphManager("session-1");
    graph1.addNode(NodeBuilder.concept("Node 1"));
    await persistenceManager.saveGraph(graph1.snapshot());

    const graph2 = new ContextGraphManager("session-2");
    graph2.addNode(NodeBuilder.concept("Node 2"));
    graph2.addNode(NodeBuilder.decision("Decision 1"));
    await persistenceManager.saveGraph(graph2.snapshot());

    const sessions = await persistenceManager.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.nodeCount).toBe(1);
    expect(sessions[1]?.nodeCount).toBe(2);
  });

  it("should sanitize chat_id in file paths", async () => {
    const graph = new ContextGraphManager("chat@123#with!special$chars");
    graph.addNode(NodeBuilder.concept("Test"));

    await persistenceManager.saveGraph(graph.snapshot());

    const loaded = await persistenceManager.loadGraph("chat@123#with!special$chars");
    expect(loaded).toBeDefined();
    expect(loaded?.metadata.chatId).toBe("chat@123#with!special$chars");
  });

  it("should restore graph from snapshot with correct structure", async () => {
    const graph1 = new ContextGraphManager("structure-test");
    const node1 = NodeBuilder.concept("Concept A");
    const node2 = NodeBuilder.decision("Decision B");

    graph1.addNode(node1);
    graph1.addNode(node2);

    const edge = EdgeBuilder.relates(node1.id, node2.id);
    graph1.addEdge(edge);

    await persistenceManager.saveGraph(graph1.snapshot());

    const graph2 = await persistenceManager.loadOrCreateGraph("structure-test");
    expect(graph2.getAllNodes()).toHaveLength(2);
    expect(graph2.getAllEdges()).toHaveLength(1);

    const retrievedEdge = graph2.getEdge(edge.id);
    expect(retrievedEdge?.type).toBe("RELATES");
  });

  it("should preserve node frequencies", async () => {
    const graph1 = new ContextGraphManager("frequency-test");
    const node = NodeBuilder.concept("Frequent Concept");
    node.frequency = 42;

    graph1.addNode(node);
    await persistenceManager.saveGraph(graph1.snapshot());

    const graph2 = await persistenceManager.loadOrCreateGraph("frequency-test");
    const retrievedNode = graph2.getNode(node.id);
    expect(retrievedNode?.frequency).toBe(42);
  });
});
