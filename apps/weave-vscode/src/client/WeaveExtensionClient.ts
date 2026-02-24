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
      const res = await this._fetch('POST', '/tools/call', { name, arguments: args });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text };
      }
      const json = await res.json() as { content?: Array<{ text?: string }> };
      const text = json.content?.[0]?.text ?? '{}';
      const data = JSON.parse(text) as T;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getSnapshot(): Promise<GraphSnapshot | null> {
    const result = await this.callTool<GraphSnapshot>('query_graph', { query: '*', limit: 200 });
    if (!result.success || !result.data) { return null; }
    return result.data;
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const res = await this._fetch('GET', '/sessions');
      if (!res.ok) { return []; }
      const json = await res.json() as { sessions?: SessionInfo[] };
      return json.sessions ?? [];
    } catch {
      return [];
    }
  }

  async listMilestones(): Promise<MilestoneItem[]> {
    const result = await this.callTool<{ milestones?: MilestoneItem[] }>('get_next_action', {});
    if (!result.success || !result.data) { return []; }
    return result.data.milestones ?? [];
  }

  async saveNode(node: Omit<WeaveNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<ToolCallResult<WeaveNode>> {
    return this.callTool<WeaveNode>('save_node', node);
  }

  async queryGraph(query: string): Promise<WeaveNode[]> {
    const result = await this.callTool<{ nodes?: WeaveNode[] }>('query_graph', { query });
    if (!result.success || !result.data) { return []; }
    return result.data.nodes ?? [];
  }

  // ---- private helpers -----------------------------------------------------

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
