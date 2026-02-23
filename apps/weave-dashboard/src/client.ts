/**
 * WeaveDashboardClient — M10
 *
 * Thin HTTP client that wraps the WeaveLink REST API.
 * Uses the global `fetch` (Node 22+ built-in / browser native).
 *
 * All methods throw `DashboardApiError` on non-2xx responses or network errors.
 */

import type {
  ToolDefinition,
  ToolCallResult,
  HealthResponse,
  ServerInfo,
  GraphSnapshot,
  SessionListEntry,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────

export class DashboardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string
  ) {
    super(message ?? `HTTP ${status}: ${body}`);
    this.name = 'DashboardApiError';
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(`Network request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'NetworkError';
  }
}

// ──────────────────────────────────────────────────────────────────────────────

export class WeaveDashboardClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  // ── Configuration ──────────────────────────────────────────────────────

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setApiKey(key: string | undefined): void {
    this.apiKey = key;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ── API methods ────────────────────────────────────────────────────────

  async getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health');
  }

  async getServerInfo(): Promise<ServerInfo> {
    return this.get<ServerInfo>('/');
  }

  async listTools(): Promise<ToolDefinition[]> {
    const res = await this.get<{ tools: ToolDefinition[] }>('/tools');
    return res.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return this.post<ToolCallResult>('/tools/call', { name, arguments: args });
  }

  /**
   * Fetch the full graph snapshot for a chat session.
   * Uses the `get_session_context` WeaveLink tool.
   */
  async getSnapshot(chatId: string): Promise<GraphSnapshot> {
    const result = await this.callTool('get_session_context', { chat_id: chatId });
    if (result.isError) {
      throw new DashboardApiError(500, result.content[0]?.text ?? 'unknown error');
    }
    // WeaveLink returns JSON-serialized context in the text content
    const raw = result.content[0]?.text ?? '{}';
    return JSON.parse(raw) as GraphSnapshot;
  }

  /**
   * List available sessions from WeaveLink.
   * Falls back to empty array if the server doesn't support session listing.
   */
  async listSessions(): Promise<SessionListEntry[]> {
    try {
      const result = await this.callTool('list_sessions', {});
      if (result.isError) return [];
      const raw = result.content[0]?.text ?? '[]';
      return JSON.parse(raw) as SessionListEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Query nodes in the graph by keyword.
   */
  async queryGraph(
    chatId: string,
    keyword: string,
    limit = 20
  ): Promise<GraphSnapshot['nodes'][string][]> {
    const result = await this.callTool('query_graph', { chat_id: chatId, keyword, limit });
    if (result.isError) return [];
    const raw = result.content[0]?.text ?? '[]';
    return JSON.parse(raw) as GraphSnapshot['nodes'][string][];
  }

  // ── SSE ───────────────────────────────────────────────────────────────

  /**
   * Open a Server-Sent Events stream and register a callback for each event.
   * Returns a `close()` function.
   */
  openEventStream(
    onEvent: (event: { type: string; data: unknown }) => void
  ): () => void {
    const es = new EventSource(`${this.baseUrl}/events`);

    es.onmessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as unknown;
        onEvent({ type: 'message', data });
      } catch {
        onEvent({ type: 'raw', data: ev.data });
      }
    };

    es.onerror = () => onEvent({ type: 'error', data: null });

    return () => es.close();
  }

  // ── Private HTTP helpers ───────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    } catch (err) {
      throw new NetworkError(err);
    }
    return this.parse<T>(res);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(err);
    }
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new DashboardApiError(res.status, text);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new DashboardApiError(res.status, text, `Failed to parse response JSON: ${text.slice(0, 80)}`);
    }
  }
}
