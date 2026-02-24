import * as vscode from 'vscode';
import {
  GraphSnapshot,
  MilestoneItem,
  ServerState,
  ServerStatus,
  SessionInfo,
  ToolCallResult,
  WeaveNode,
} from '../types';

// ---------------------------------------------------------------------------
// Event emitter helper — typed thin wrapper
// ---------------------------------------------------------------------------

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private listeners: Array<Listener<T>> = [];
  emit(value: T) { this.listeners.forEach((l) => l(value)); }
  on(listener: Listener<T>) { this.listeners.push(listener); }
  off(listener: Listener<T>) { this.listeners = this.listeners.filter((l) => l !== listener); }
  dispose() { this.listeners = []; }
}

// ---------------------------------------------------------------------------
// WeaveExtensionClient
// Thin HTTP wrapper around the WeaveLink REST / MCP transport.
// All VS Code config reads go through getConfig() so they pick up live changes.
// ---------------------------------------------------------------------------

export class WeaveExtensionClient implements vscode.Disposable {
  // ---- public events -------------------------------------------------------
  readonly onStatusChange = new Emitter<ServerStatus>();
  readonly onGraphUpdate  = new Emitter<GraphSnapshot>();

  // ---- private state -------------------------------------------------------
  private _status: ServerStatus = { state: 'disconnected', url: '' };
  private _sseController: AbortController | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  // ---- lifecycle -----------------------------------------------------------

  async connect(): Promise<void> {
    this._setStatus({ state: 'connecting', url: this._url() });
    try {
      await this.checkHealth();
      this._setStatus({ state: 'connected', url: this._url() });
      this._startSSE();
      this._startPolling();
    } catch (err) {
      this._setStatus({ state: 'error', url: this._url(), message: String(err) });
    }
  }

  disconnect(): void {
    this._stopSSE();
    this._stopPolling();
    this._setStatus({ state: 'disconnected', url: this._url() });
  }

  dispose(): void {
    this.disconnect();
    this.onStatusChange.dispose();
    this.onGraphUpdate.dispose();
  }

  // ---- public API ----------------------------------------------------------

  get status(): ServerStatus { return this._status; }

  async checkHealth(): Promise<void> {
    const res = await this._fetch('GET', '/health');
    if (!res.ok) { throw new Error(`Health check failed: ${res.status}`); }
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult<T>> {
    try {
      const res = await this._fetch('POST', '/tools/call', { tool: name, args });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text };
      }
      // Server returns: { content: [{ type: 'text', data: {...} }] }
      const json = await res.json() as { content?: Array<{ data?: unknown; text?: string }> };
      const item = json.content?.[0];
      let data: T;
      if (item?.data !== undefined) {
        // Preferred: structured .data field
        data = item.data as T;
      } else {
        // Fallback: JSON-encoded .text field
        const text = (item as { text?: string } | undefined)?.text ?? '{}';
        try {
          data = JSON.parse(text) as T;
        } catch {
          return { success: false, error: text };
        }
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getSnapshot(): Promise<GraphSnapshot | null> {
    const chatId = this._chatId();
    type ContextResult = {
      total_nodes: number;
      total_edges: number;
      nodes: Array<{ node_id: string; label: string; type: string; frequency: number }>;
    };
    const result = await this.callTool<ContextResult>('get_session_context', { chat_id: chatId });
    if (!result.success || !result.data) { return null; }
    const { total_nodes, total_edges, nodes } = result.data;
    return {
      nodes: (nodes ?? []).map(n => ({
        id: n.node_id,
        label: n.label,
        type: n.type as import('../types').NodeType,
        metadata: {},
      })),
      edges: [],
      nodeCount: total_nodes,
      edgeCount: total_edges,
      timestamp: new Date().toISOString(),
    };
  }

  async listSessions(): Promise<SessionInfo[]> {
    const chatId = this._chatId();
    type ContextResult = { total_nodes: number; total_edges: number };
    const result = await this.callTool<ContextResult>('get_session_context', { chat_id: chatId });
    if (!result.success || !result.data) { return []; }
    return [{
      id: chatId,
      name: chatId,
      provider: 'json',
      nodeCount: result.data.total_nodes,
      startedAt: new Date().toISOString(),
    }];
  }

  async listMilestones(): Promise<MilestoneItem[]> {
    const chatId = this._chatId();
    type NextAction = {
      milestone_id?: string;
      title?: string;
      description?: string;
      priority?: string;
    };
    const result = await this.callTool<NextAction>('get_next_action', { chat_id: chatId });
    if (!result.success || !result.data || !result.data.milestone_id) { return []; }
    const d = result.data;
    return [{
      id: d.milestone_id!,
      title: d.title ?? d.milestone_id!,
      status: 'not-started',
    }];
  }

  async saveNode(node: Omit<WeaveNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<ToolCallResult<WeaveNode>> {
    const chatId = vscode.workspace.workspaceFolders?.[0]?.name ?? 'default';
    const nodeId = `${chatId}-${Date.now()}`;
    return this.callTool<WeaveNode>('save_node', {
      chat_id: chatId,
      node_id: nodeId,
      node_label: node.label,
      node_type: node.type,
      metadata: node.metadata ?? {},
    });
  }

  async queryGraph(query: string): Promise<WeaveNode[]> {
    const chatId = this._chatId();
    type QueryResult = {
      results?: Array<{ node_id: string; label: string; type: string; frequency: number; score: number }>;
    };
    const result = await this.callTool<QueryResult>('query_graph', { chat_id: chatId, query, limit: 50 });
    if (!result.success || !result.data) { return []; }
    return (result.data.results ?? []).map(r => ({
      id: r.node_id,
      label: r.label,
      type: r.type as import('../types').NodeType,
      metadata: {},
    }));
  }

  // ---- private helpers -----------------------------------------------------

  private _chatId(): string {
    return vscode.workspace.workspaceFolders?.[0]?.name ?? 'default';
  }

  private _url(): string {
    return vscode.workspace.getConfiguration('openweave').get<string>('serverUrl', 'http://localhost:3000');
  }

  private _apiKey(): string {
    return vscode.workspace.getConfiguration('openweave').get<string>('apiKey', '');
  }

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this._apiKey();
    if (key) { headers['Authorization'] = `Bearer ${key}`; }
    return headers;
  }

  private async _fetch(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this._url()}${path}`;
    const init: RequestInit = { method, headers: this._headers(), signal: AbortSignal.timeout(8000) };
    if (body !== undefined) { init.body = JSON.stringify(body); }
    return fetch(url, init);
  }

  private _setStatus(status: ServerStatus): void {
    this._status = status;
    this.onStatusChange.emit(status);
  }

  // ---- SSE (Server-Sent Events) --------------------------------------------

  private _startSSE(): void {
    this._stopSSE();
    this._sseController = new AbortController();
    const url = `${this._url()}/events`;
    const headers = this._headers();

    (async () => {
      try {
        const res = await fetch(url, { headers, signal: this._sseController!.signal });
        if (!res.ok || !res.body) { return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }
          const text = decoder.decode(value);
          this._handleSSEChunk(text);
        }
      } catch {
        // SSE disconnected — polling will keep things alive
      }
    })();
  }

  private _stopSSE(): void {
    this._sseController?.abort();
    this._sseController = null;
  }

  private _handleSSEChunk(chunk: string): void {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) { continue; }
      const raw = line.slice(5).trim();
      if (!raw) { continue; }
      try {
        const event = JSON.parse(raw) as { type?: string; snapshot?: GraphSnapshot };
        if (event.type === 'graph:update' && event.snapshot) {
          this.onGraphUpdate.emit(event.snapshot);
        }
      } catch { /* ignore malformed events */ }
    }
  }

  // ---- Polling fallback ----------------------------------------------------

  private _startPolling(): void {
    this._stopPolling();
    const ms = vscode.workspace.getConfiguration('openweave').get<number>('refreshIntervalMs', 5000);
    if (ms <= 0) { return; }
    this._pollTimer = setInterval(async () => {
      if (this._status.state !== 'connected') { return; }
      const snapshot = await this.getSnapshot();
      if (snapshot) { this.onGraphUpdate.emit(snapshot); }
    }, ms);
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
}
