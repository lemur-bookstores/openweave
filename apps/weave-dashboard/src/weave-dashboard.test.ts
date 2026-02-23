/**
 * Weave Dashboard — M10 Tests
 *
 * Coverage (pure logic only — no DOM/D3):
 *   WeaveDashboardClient  — 12 tests
 *   SessionDiff           — 12 tests
 *   GraphLayoutEngine     — 10 tests
 *   MilestoneBoard        — 13 tests
 *   ErrorRegistry         — 13 tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeaveDashboardClient, DashboardApiError, NetworkError } from './client';
import { SessionDiff } from './session-diff';
import { GraphLayoutEngine } from './graph-layout';
import { MilestoneBoard } from './milestone-board';
import { ErrorRegistry } from './error-registry';
import type {
  GraphSnapshot,
  DashboardNode,
  DashboardEdge,
  Milestone,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

function makeNode(id: string, type: DashboardNode['type'], label: string, frequency = 1): DashboardNode {
  return { id, type, label, frequency, createdAt: NOW, updatedAt: NOW };
}

function makeEdge(id: string, src: string, tgt: string, type: DashboardEdge['type']): DashboardEdge {
  return { id, sourceId: src, targetId: tgt, type, weight: 1, createdAt: NOW, updatedAt: NOW };
}

function makeSnapshot(nodes: DashboardNode[], edges: DashboardEdge[], chatId = 'test'): GraphSnapshot {
  return {
    nodes: Object.fromEntries(nodes.map(n => [n.id, n])),
    edges: Object.fromEntries(edges.map(e => [e.id, e])),
    metadata: { chatId, version: '1', createdAt: NOW, updatedAt: NOW, compressionThreshold: 0.75 },
  };
}

function makeMilestone(
  id: string,
  status: Milestone['status'],
  priority: Milestone['priority'] = 'MEDIUM',
  estimatedHours = 8,
  subTaskCount = 0,
  completedSubTaskCount = 0
): Milestone {
  const subTasks = Array.from({ length: subTaskCount }, (_, i) => ({
    id: `st-${id}-${i}`,
    title: `SubTask ${i}`,
    status: (i < completedSubTaskCount ? 'COMPLETED' : 'NOT_STARTED') as Milestone['status'],
    priority: 'MEDIUM' as const,
    estimatedHours: 1,
    dependencies: [],
  }));
  return { id, name: `Milestone ${id}`, status, priority, subTasks, estimatedHours };
}

// Mock fetch globally
function mockFetch(response: unknown, status = 200, ok = true) {
  const mockResponse = {
    ok,
    status,
    text: vi.fn().mockResolvedValue(typeof response === 'string' ? response : JSON.stringify(response)),
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
  return mockResponse;
}

function mockFetchError(message: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// ──────────────────────────────────────────────────────────────────────────────
// WeaveDashboardClient
// ──────────────────────────────────────────────────────────────────────────────

describe('WeaveDashboardClient', () => {
  let client: WeaveDashboardClient;

  beforeEach(() => {
    client = new WeaveDashboardClient('http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getHealth returns parsed response', async () => {
    mockFetch({ status: 'ok', version: '0.2.0', uptime: 42, transport: 'http' });
    const h = await client.getHealth();
    expect(h.status).toBe('ok');
    expect(h.version).toBe('0.2.0');
  });

  it('listTools returns tools array', async () => {
    mockFetch({ tools: [{ name: 'save_node', description: 'desc', inputSchema: {} }] });
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('save_node');
  });

  it('callTool posts to /tools/call with correct body', async () => {
    mockFetch({ content: [{ type: 'text', text: 'ok' }] });
    await client.callTool('query_graph', { keyword: 'test' });
    const fetchMock = vi.mocked(fetch);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toContain('/tools/call');
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.name).toBe('query_graph');
    expect(body.arguments.keyword).toBe('test');
  });

  it('throws DashboardApiError on non-2xx response', async () => {
    mockFetch('Not Found', 404, false);
    await expect(client.getHealth()).rejects.toBeInstanceOf(DashboardApiError);
  });

  it('DashboardApiError carries status code', async () => {
    mockFetch('Unauthorized', 401, false);
    try {
      await client.getServerInfo();
    } catch (err) {
      expect((err as DashboardApiError).status).toBe(401);
    }
  });

  it('throws NetworkError on fetch failure', async () => {
    mockFetchError('ECONNREFUSED');
    await expect(client.getHealth()).rejects.toBeInstanceOf(NetworkError);
  });

  it('NetworkError message includes original cause', async () => {
    mockFetchError('timeout');
    try {
      await client.getHealth();
    } catch (err) {
      expect((err as NetworkError).message).toContain('timeout');
    }
  });

  it('setBaseUrl and getBaseUrl round-trip correctly', () => {
    client.setBaseUrl('http://example.com:4000/');
    expect(client.getBaseUrl()).toBe('http://example.com:4000');
  });

  it('includes Authorization header when API key is set', async () => {
    client.setApiKey('test-key-123');
    mockFetch({ status: 'ok', version: '1', uptime: 0, transport: 'http' });
    await client.getHealth();
    const fetchMock = vi.mocked(fetch);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key-123');
  });

  it('does not send Authorization header without API key', async () => {
    mockFetch({ status: 'ok', version: '1', uptime: 0, transport: 'http' });
    await client.getHealth();
    const fetchMock = vi.mocked(fetch);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('listSessions returns empty array when tool not found', async () => {
    mockFetch({ content: [{ type: 'text', text: 'Unknown tool' }], isError: true });
    const sessions = await client.listSessions();
    expect(sessions).toEqual([]);
  });

  it('throws DashboardApiError with helpful message on non-JSON response', async () => {
    mockFetch('Internal Server Error', 500, false);
    try {
      await client.listTools();
    } catch (err) {
      expect(err).toBeInstanceOf(DashboardApiError);
      expect((err as DashboardApiError).body).toContain('Internal Server Error');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SessionDiff
// ──────────────────────────────────────────────────────────────────────────────

describe('SessionDiff', () => {
  it('identical snapshots → no changes, similarity 1', () => {
    const snap = makeSnapshot([makeNode('a', 'CONCEPT', 'A')], []);
    const diff = SessionDiff.diff('s1', snap, 's2', snap);
    expect(diff.stats.totalChanges).toBe(0);
    expect(diff.stats.similarity).toBe(1);
  });

  it('detects added nodes', () => {
    const snapA = makeSnapshot([], []);
    const snapB = makeSnapshot([makeNode('a', 'CONCEPT', 'Alpha')], []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.addedNodes).toHaveLength(1);
    expect(diff.addedNodes[0]?.label).toBe('Alpha');
  });

  it('detects removed nodes', () => {
    const snapA = makeSnapshot([makeNode('a', 'CONCEPT', 'Alpha')], []);
    const snapB = makeSnapshot([], []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0]?.id).toBe('a');
  });

  it('detects changed node label', () => {
    const snapA = makeSnapshot([makeNode('a', 'CONCEPT', 'Alpha')], []);
    const snapB = makeSnapshot([makeNode('a', 'CONCEPT', 'Beta')], []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.changedNodes).toHaveLength(1);
    expect(diff.changedNodes[0]?.changes).toContain('label: Alpha → Beta');
  });

  it('detects changed node type', () => {
    const snapA = makeSnapshot([makeNode('a', 'CONCEPT', 'A')], []);
    const snapB = makeSnapshot([makeNode('a', 'ERROR', 'A')], []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.changedNodes[0]?.changes.some(c => c.includes('type'))).toBe(true);
  });

  it('detects added edges', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')];
    const snapA = makeSnapshot(nodes, []);
    const snapB = makeSnapshot(nodes, [makeEdge('e1', 'a', 'b', 'RELATES')]);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.addedEdges).toHaveLength(1);
  });

  it('detects removed edges', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')];
    const snapA = makeSnapshot(nodes, [makeEdge('e1', 'a', 'b', 'RELATES')]);
    const snapB = makeSnapshot(nodes, []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.removedEdges).toHaveLength(1);
  });

  it('session IDs are preserved in diff result', () => {
    const snap = makeSnapshot([], []);
    const diff = SessionDiff.diff('session-X', snap, 'session-Y', snap);
    expect(diff.sessionA).toBe('session-X');
    expect(diff.sessionB).toBe('session-Y');
  });

  it('similarity decreases as more changes are made', () => {
    const snapA = makeSnapshot(
      Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`, 'CONCEPT', `N${i}`)),
      []
    );
    const snapB = makeSnapshot(
      Array.from({ length: 10 }, (_, i) => makeNode(`n${i + 5}`, 'CONCEPT', `N${i + 5}`)),
      []
    );
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    expect(diff.stats.similarity).toBeLessThan(1);
  });

  it('summarize returns "No changes" for identical snapshots', () => {
    const snap = makeSnapshot([], []);
    const diff = SessionDiff.diff('a', snap, 'b', snap);
    expect(SessionDiff.summarize(diff)).toBe('No changes detected (identical snapshots)');
  });

  it('summarize mentions added nodes count', () => {
    const snapA = makeSnapshot([], []);
    const snapB = makeSnapshot([makeNode('x', 'DECISION', 'Decision X')], []);
    const diff = SessionDiff.diff('a', snapA, 'b', snapB);
    expect(SessionDiff.summarize(diff)).toContain('+1 node');
  });

  it('totalChanges equals sum of all diff categories', () => {
    const snapA = makeSnapshot([makeNode('a', 'CONCEPT', 'A')], []);
    const snapB = makeSnapshot([makeNode('b', 'CONCEPT', 'B')], []);
    const diff = SessionDiff.diff('s1', snapA, 's2', snapB);
    const manual = diff.addedNodes.length + diff.removedNodes.length + diff.changedNodes.length +
                   diff.addedEdges.length + diff.removedEdges.length;
    expect(diff.stats.totalChanges).toBe(manual);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GraphLayoutEngine
// ──────────────────────────────────────────────────────────────────────────────

describe('GraphLayoutEngine', () => {
  const engine = new GraphLayoutEngine({ width: 800, height: 600, iterations: 20 });

  it('returns empty layout for empty snapshot', () => {
    const layout = engine.compute(makeSnapshot([], []));
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it('produces one LayoutNode per input node', () => {
    const snap = makeSnapshot([makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')], []);
    const layout = engine.compute(snap);
    expect(layout.nodes).toHaveLength(2);
  });

  it('produces one LayoutEdge per valid input edge', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const layout = engine.compute(makeSnapshot(nodes, edges));
    expect(layout.edges).toHaveLength(1);
  });

  it('ignores dangling edges (references non-existent node)', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A')];
    const edges = [makeEdge('e1', 'a', 'MISSING', 'RELATES')];
    const layout = engine.compute(makeSnapshot(nodes, edges));
    expect(layout.edges).toHaveLength(0);
  });

  it('all nodes have numeric x and y positions', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'ERROR', 'B')];
    const layout = engine.compute(makeSnapshot(nodes, []));
    for (const n of layout.nodes) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    }
  });

  it('validateBounds returns true for positions within canvas', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A')];
    const layout = engine.compute(makeSnapshot(nodes, []));
    expect(GraphLayoutEngine.validateBounds(layout, 800, 600)).toBe(true);
  });

  it('layout edges have resolved source and target LayoutNode references', () => {
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')];
    const edges = [makeEdge('e1', 'a', 'b', 'RELATES')];
    const layout = engine.compute(makeSnapshot(nodes, edges));
    expect(layout.edges[0]?.source.id).toBe('a');
    expect(layout.edges[0]?.target.id).toBe('b');
  });

  it('custom k overrides default spring constant', () => {
    const custom = new GraphLayoutEngine({ k: 200, iterations: 5 });
    const nodes = [makeNode('a', 'CONCEPT', 'A'), makeNode('b', 'CONCEPT', 'B')];
    const layout = custom.compute(makeSnapshot(nodes, []));
    expect(layout.nodes).toHaveLength(2);
  });

  it('graph with many nodes still completes within bounds', () => {
    const bigEngine = new GraphLayoutEngine({ width: 1000, height: 800, iterations: 10 });
    const nodes = Array.from({ length: 30 }, (_, i) => makeNode(`n${i}`, 'CONCEPT', `N${i}`));
    const layout = bigEngine.compute(makeSnapshot(nodes, []));
    expect(GraphLayoutEngine.validateBounds(layout, 1000, 800)).toBe(true);
  });

  it('LayoutNode retains original node properties', () => {
    const node = makeNode('a', 'ERROR', 'TypeError', 5);
    const layout = engine.compute(makeSnapshot([node], []));
    const ln = layout.nodes[0]!;
    expect(ln.id).toBe('a');
    expect(ln.type).toBe('ERROR');
    expect(ln.label).toBe('TypeError');
    expect(ln.frequency).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MilestoneBoard
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneBoard', () => {
  it('toColumns returns exactly 5 columns', () => {
    const cols = MilestoneBoard.toColumns([]);
    expect(cols).toHaveLength(5);
  });

  it('columns are in the correct order', () => {
    const cols = MilestoneBoard.toColumns([]);
    expect(cols.map(c => c.status)).toEqual([
      'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'DEFERRED',
    ]);
  });

  it('milestone is placed in the correct column', () => {
    const milestones = [
      makeMilestone('m1', 'COMPLETED'),
      makeMilestone('m2', 'IN_PROGRESS'),
    ];
    const cols = MilestoneBoard.toColumns(milestones);
    expect(cols.find(c => c.status === 'COMPLETED')?.milestones).toHaveLength(1);
    expect(cols.find(c => c.status === 'IN_PROGRESS')?.milestones).toHaveLength(1);
  });

  it('toCard computes progressPct from subTasks', () => {
    const m = makeMilestone('m1', 'IN_PROGRESS', 'HIGH', 10, 4, 2);
    const card = MilestoneBoard.toCard(m);
    expect(card.progressPct).toBe(50);
  });

  it('toCard gives 100% progress for COMPLETED with no subTasks', () => {
    const m = makeMilestone('m1', 'COMPLETED');
    const card = MilestoneBoard.toCard(m);
    expect(card.progressPct).toBe(100);
  });

  it('toCard gives 0% for NOT_STARTED with no subTasks', () => {
    const m = makeMilestone('m1', 'NOT_STARTED');
    const card = MilestoneBoard.toCard(m);
    expect(card.progressPct).toBe(0);
  });

  it('stats.total equals milestones.length', () => {
    const ms = [makeMilestone('m1', 'COMPLETED'), makeMilestone('m2', 'NOT_STARTED')];
    expect(MilestoneBoard.stats(ms).total).toBe(2);
  });

  it('stats.overallProgress is 100% for empty milestones', () => {
    expect(MilestoneBoard.stats([]).overallProgress).toBe(100);
  });

  it('stats.overallProgress excludes BLOCKED and DEFERRED', () => {
    const ms = [
      makeMilestone('m1', 'COMPLETED'),
      makeMilestone('m2', 'BLOCKED'),
      makeMilestone('m3', 'DEFERRED'),
    ];
    const s = MilestoneBoard.stats(ms);
    // Only m1 is active; 1/1 completed = 100%
    expect(s.overallProgress).toBe(100);
  });

  it('stats.totalEstimatedHours sums all milestones', () => {
    const ms = [makeMilestone('m1', 'COMPLETED', 'HIGH', 8), makeMilestone('m2', 'NOT_STARTED', 'LOW', 4)];
    expect(MilestoneBoard.stats(ms).totalEstimatedHours).toBe(12);
  });

  it('sortByPriority orders CRITICAL before LOW', () => {
    const cards = [
      MilestoneBoard.toCard(makeMilestone('m1', 'NOT_STARTED', 'LOW')),
      MilestoneBoard.toCard(makeMilestone('m2', 'NOT_STARTED', 'CRITICAL')),
    ];
    const sorted = MilestoneBoard.sortByPriority(cards);
    expect(sorted[0]?.priority).toBe('CRITICAL');
  });

  it('sortByPriority uses alphabetical name for same priority', () => {
    const cols = MilestoneBoard.toColumns([
      { ...makeMilestone('m1', 'NOT_STARTED'), name: 'Zebra' },
      { ...makeMilestone('m2', 'NOT_STARTED'), name: 'Alpha' },
    ]);
    const notStarted = cols.find(c => c.status === 'NOT_STARTED')!;
    const sorted = MilestoneBoard.sortByPriority(notStarted.milestones);
    expect(sorted[0]?.name).toBe('Alpha');
  });

  it('byStatus counts correct number per status', () => {
    const ms = [
      makeMilestone('m1', 'COMPLETED'),
      makeMilestone('m2', 'COMPLETED'),
      makeMilestone('m3', 'NOT_STARTED'),
    ];
    const s = MilestoneBoard.stats(ms);
    expect(s.byStatus.COMPLETED).toBe(2);
    expect(s.byStatus.NOT_STARTED).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ErrorRegistry
// ──────────────────────────────────────────────────────────────────────────────

describe('ErrorRegistry', () => {
  it('build returns empty for snapshot with no ERROR nodes', () => {
    const snap = makeSnapshot([makeNode('a', 'CONCEPT', 'Alpha')], []);
    expect(ErrorRegistry.build(snap)).toHaveLength(0);
  });

  it('build returns one entry per ERROR node', () => {
    const snap = makeSnapshot([
      makeNode('e1', 'ERROR', 'TypeError'),
      makeNode('e2', 'ERROR', 'RangeError'),
      makeNode('c1', 'CONCEPT', 'Other'),
    ], []);
    expect(ErrorRegistry.build(snap)).toHaveLength(2);
  });

  it('marks errors with CORRECTS edges as corrected', () => {
    const errNode = makeNode('e1', 'ERROR', 'TypeError');
    const fixNode = makeNode('f1', 'CORRECTION', 'Fixed');
    const edge = makeEdge('edge1', 'f1', 'e1', 'CORRECTS');
    const snap = makeSnapshot([errNode, fixNode], [edge]);
    const entries = ErrorRegistry.build(snap);
    expect(entries[0]?.isCorrected).toBe(true);
    expect(entries[0]?.correctedBy).toBe('Fixed');
  });

  it('marks errors without CORRECTS edges as uncorrected', () => {
    const snap = makeSnapshot([makeNode('e1', 'ERROR', 'Bug')], []);
    const entries = ErrorRegistry.build(snap);
    expect(entries[0]?.isCorrected).toBe(false);
    expect(entries[0]?.correctedBy).toBeUndefined();
  });

  it('build sorts by frequency descending', () => {
    const snap = makeSnapshot([
      makeNode('e1', 'ERROR', 'Rare', 1),
      makeNode('e2', 'ERROR', 'Common', 10),
    ], []);
    const entries = ErrorRegistry.build(snap);
    expect(entries[0]?.node.label).toBe('Common');
  });

  it('filter excludes corrected errors when showCorrected=false', () => {
    const errNode = makeNode('e1', 'ERROR', 'TypeError');
    const fixNode = makeNode('f1', 'CORRECTION', 'Fixed');
    const edge = makeEdge('edge1', 'f1', 'e1', 'CORRECTS');
    const snap = makeSnapshot([errNode, fixNode], [edge]);
    const all = ErrorRegistry.build(snap);
    const filtered = ErrorRegistry.filter(all, { showCorrected: false });
    expect(filtered).toHaveLength(0);
  });

  it('filter includes corrected errors when showCorrected=true', () => {
    const errNode = makeNode('e1', 'ERROR', 'TypeError');
    const fixNode = makeNode('f1', 'CORRECTION', 'Fixed');
    const edge = makeEdge('edge1', 'f1', 'e1', 'CORRECTS');
    const snap = makeSnapshot([errNode, fixNode], [edge]);
    const all = ErrorRegistry.build(snap);
    const filtered = ErrorRegistry.filter(all, { showCorrected: true });
    expect(filtered).toHaveLength(1);
  });

  it('filter by searchQuery matches label case-insensitively', () => {
    const snap = makeSnapshot([
      makeNode('e1', 'ERROR', 'TypeError'),
      makeNode('e2', 'ERROR', 'SyntaxError'),
    ], []);
    const all = ErrorRegistry.build(snap);
    const filtered = ErrorRegistry.filter(all, { showCorrected: true, searchQuery: 'syntax' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.node.label).toBe('SyntaxError');
  });

  it('filter by searchQuery matches correctedBy label', () => {
    const errNode = makeNode('e1', 'ERROR', 'Bug');
    const fixNode = makeNode('f1', 'CORRECTION', 'SpecialFix');
    const edge = makeEdge('edge1', 'f1', 'e1', 'CORRECTS');
    const snap = makeSnapshot([errNode, fixNode], [edge]);
    const all = ErrorRegistry.build(snap);
    const filtered = ErrorRegistry.filter(all, { showCorrected: true, searchQuery: 'special' });
    expect(filtered).toHaveLength(1);
  });

  it('stats.correctionRate is 1 when no errors exist', () => {
    expect(ErrorRegistry.stats([]).correctionRate).toBe(1);
  });

  it('stats.correctionRate is 0 when all errors are uncorrected', () => {
    const snap = makeSnapshot([makeNode('e1', 'ERROR', 'Bug')], []);
    const entries = ErrorRegistry.build(snap);
    expect(ErrorRegistry.stats(entries).correctionRate).toBe(0);
  });

  it('stats.total, corrected, uncorrected are consistent', () => {
    const snap = makeSnapshot([
      makeNode('e1', 'ERROR', 'Bug1'),
      makeNode('e2', 'ERROR', 'Bug2'),
    ], [makeEdge('edge1', 'f1', 'e1', 'CORRECTS')]);
    // Note: f1 doesn't exist as a node, so correctedBy is undefined
    const entries = ErrorRegistry.build(snap);
    const s = ErrorRegistry.stats(entries);
    expect(s.total).toBe(s.corrected + s.uncorrected);
  });

  it('filter returns all when no options given', () => {
    const snap = makeSnapshot([makeNode('e1', 'ERROR', 'Bug')], []);
    const entries = ErrorRegistry.build(snap);
    // showCorrected defaults to undefined (falsy) → excludes corrected only
    const filtered = ErrorRegistry.filter(entries, {});
    expect(filtered).toHaveLength(1);
  });
});
