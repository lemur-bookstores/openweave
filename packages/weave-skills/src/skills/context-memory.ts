/**
 * Skill: context-memory
 *
 * Persists architectural decisions, team agreements and agent reasoning sessions
 * into the WeaveGraph knowledge graph for long-term cross-session memory.
 *
 * Actions:
 *   - save   — persist a new memory entry as a graph node
 *   - load   — retrieve entries by id or tag
 *   - list   — list all persisted memory entries (optionally filtered by type/tag)
 *
 * Input (via SkillContext.graph):
 *   - `ctx.graph['action']`  — 'save' | 'load' | 'list' (default: 'list')
 *   - `ctx.graph['entry']`   — MemoryEntry (required for 'save')
 *   - `ctx.graph['query']`   — string keyword for 'load'
 *   - `ctx.graph['store']`   — Record<string,MemoryEntry> injectable in-memory store for tests
 *
 * Output data:
 *   - ContextMemoryResult
 */

import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryEntryType =
  | 'decision'
  | 'agreement'
  | 'reasoning'
  | 'constraint'
  | 'pattern'
  | 'note';

export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  sessionId?: string;
}

export interface ContextMemoryResult {
  action: 'save' | 'load' | 'list';
  saved?: MemoryEntry;
  entries: MemoryEntry[];
  total: number;
  query?: string;
}

// ---------------------------------------------------------------------------
// In-process store (used when no WeaveGraph is available)
// ---------------------------------------------------------------------------

// Module-level fallback store — shared across calls in a single process.
const _fallbackStore: Map<string, MemoryEntry> = new Map();

export function generateId(entry: Omit<MemoryEntry, 'id'>): string {
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  const ts = entry.createdAt.replace(/\D/g, '').slice(0, 12);
  return `mem-${entry.type}-${slug}-${ts}`;
}

export function matchesQuery(entry: MemoryEntry, query: string): boolean {
  const q = query.toLowerCase();
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.content.toLowerCase().includes(q) ||
    entry.tags.some((t) => t.toLowerCase().includes(q)) ||
    entry.type.toLowerCase().includes(q)
  );
}

export function saveEntry(
  store: Map<string, MemoryEntry>,
  raw: Partial<MemoryEntry>,
  sessionId?: string,
): MemoryEntry {
  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: raw.id ?? '',
    type: raw.type ?? 'note',
    title: raw.title ?? 'Untitled',
    content: raw.content ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.createdAt ?? now,
    sessionId: raw.sessionId ?? sessionId,
  };
  if (!entry.id) {
    entry.id = generateId(entry);
  }
  store.set(entry.id, entry);
  return entry;
}

export function listEntries(
  store: Map<string, MemoryEntry>,
  query?: string,
  type?: MemoryEntryType,
): MemoryEntry[] {
  let entries = Array.from(store.values());
  if (type) entries = entries.filter((e) => e.type === type);
  if (query) entries = entries.filter((e) => matchesQuery(e, query));
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// WeaveGraph integration (duck-typed, optional)
// ---------------------------------------------------------------------------

interface GraphLike {
  save?: (entry: MemoryEntry) => void | Promise<void>;
  query?: (keyword: string) => unknown[];
}

function getGraphStore(graph: unknown): GraphLike | null {
  if (graph && typeof graph === 'object' && 'save' in graph) {
    return graph as GraphLike;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const contextMemorySkill: SkillModule = {
  id: 'context-memory',
  name: 'Context Memory Persister',
  description:
    'Saves architectural decisions, team agreements and session reasoning to WeaveGraph for long-term memory across sessions.',
  version: '1.0.0',
  enabled: true,
  tags: ['memory', 'dx', 'graph', 'persistence'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph ?? {}) as Record<string, unknown>;
    const action = (opts['action'] as 'save' | 'load' | 'list') ?? 'list';

    // Determine the store to use (injectable in tests via ctx.graph['store'])
    const injectedStore = opts['store'];
    let store: Map<string, MemoryEntry>;
    if (injectedStore && injectedStore instanceof Map) {
      store = injectedStore as Map<string, MemoryEntry>;
    } else if (injectedStore && typeof injectedStore === 'object') {
      // Support plain object store (easier in tests)
      store = new Map(Object.entries(injectedStore as Record<string, MemoryEntry>));
    } else {
      store = _fallbackStore;
    }

    const sessionId = ctx.session?.id;

    // -----------------------------------------------------------------------
    if (action === 'save') {
      const raw = opts['entry'] as Partial<MemoryEntry> | undefined;
      if (!raw || !raw.content) {
        return {
          success: false,
          output: 'save action requires ctx.graph["entry"] with at least a content field',
          error: 'missing entry',
        };
      }

      const saved = saveEntry(store, raw, sessionId);

      // If a WeaveGraph-like object is available, also persist there
      const graphStore = getGraphStore(opts['graphHandle']);
      if (graphStore?.save) {
        await graphStore.save(saved);
      }

      const result: ContextMemoryResult = {
        action: 'save',
        saved,
        entries: [saved],
        total: store.size,
      };

      return {
        success: true,
        output: `Memory entry saved: "${saved.title}" (${saved.id})`,
        data: result,
      };
    }

    // -----------------------------------------------------------------------
    if (action === 'load') {
      const query = (opts['query'] as string | undefined) ?? '';
      const type = opts['type'] as MemoryEntryType | undefined;
      const entries = listEntries(store, query || undefined, type);

      const result: ContextMemoryResult = {
        action: 'load',
        entries,
        total: entries.length,
        query,
      };

      return {
        success: true,
        output: `Found ${entries.length} memory entr${entries.length === 1 ? 'y' : 'ies'}${query ? ` matching "${query}"` : ''}`,
        data: result,
      };
    }

    // -----------------------------------------------------------------------
    // action === 'list'
    const type = opts['type'] as MemoryEntryType | undefined;
    const entries = listEntries(store, undefined, type);

    const result: ContextMemoryResult = {
      action: 'list',
      entries,
      total: entries.length,
    };

    return {
      success: true,
      output: `${entries.length} memory entr${entries.length === 1 ? 'y' : 'ies'} in store`,
      data: result,
    };
  },
};
