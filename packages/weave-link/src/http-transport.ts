/**
 * HTTP Transport — M9: Remote WeaveLink
 *
 * Provides an HTTP server with JSON-RPC-style endpoints and
 * optional Server-Sent Events (SSE) for push notifications.
 *
 * Endpoints:
 *   GET  /              → server info (no auth)
 *   GET  /health        → liveness check (no auth)
 *   GET  /tools         → list available tools (auth optional)
 *   POST /tools/call    → invoke a tool (auth required)
 *   GET  /events        → SSE stream (auth required)
 *
 * Zero runtime dependencies — uses Node built-ins only.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { WeaveLinkServer } from './mcp-server';
import { AuthManager } from './auth';

export interface HttpTransportConfig {
  port?: number;
  host?: string;
  /**
   * If true, sets CORS headers allowing any origin.
   * Useful for local dashboard / VS Code webviews.
   */
  cors?: boolean;
  /** Printed to stdout on startup. */
  verbose?: boolean;
}

interface SSEClient {
  id: string;
  res: ServerResponse;
}

// ──────────────────────────────────────────────────────────
// WeaveLink HTTP Transport
// ──────────────────────────────────────────────────────────

export class HttpTransport {
  private server: Server | null = null;
  private weaveLinkServer: WeaveLinkServer;
  private auth: AuthManager;
  private config: Required<HttpTransportConfig>;
  private sseClients: Map<string, SSEClient> = new Map();
  private startTime: Date | null = null;

  constructor(
    weaveLinkServer?: WeaveLinkServer,
    auth?: AuthManager,
    config?: HttpTransportConfig
  ) {
    this.weaveLinkServer = weaveLinkServer || new WeaveLinkServer();
    this.auth = auth || new AuthManager({ enabled: false });
    this.config = {
      port: config?.port ?? 3001,
      host: config?.host ?? '127.0.0.1',
      cors: config?.cors ?? true,
      verbose: config?.verbose ?? false,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Start listening on the configured port.
   */
  async start(): Promise<void> {
    await this.weaveLinkServer.initialize();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.dispatch(req, res));

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.config.port, this.config.host, () => {
        this.startTime = new Date();
        if (this.config.verbose) {
          console.log(
            `[WeaveLink] HTTP transport listening on http://${this.config.host}:${this.config.port}`
          );
        }
        resolve();
      });
    });
  }

  /**
   * Stop the server and disconnect all SSE clients.
   */
  async stop(): Promise<void> {
    // Close all SSE connections
    for (const client of this.sseClients.values()) {
      client.res.end();
    }
    this.sseClients.clear();

    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  getPort(): number {
    return this.config.port;
  }

  getConnectedClients(): number {
    return this.sseClients.size;
  }

  // ── Request dispatcher ────────────────────────────────────

  private dispatch(req: IncomingMessage, res: ServerResponse): void {
    if (this.config.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    }

    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${this.config.host}`);
    const path = url.pathname;

    // Public endpoints (no auth)
    if (path === '/' && req.method === 'GET') return this.handleInfo(req, res);
    if (path === '/health' && req.method === 'GET') return this.handleHealth(req, res);

    // Protected endpoints
    if (path === '/tools' && req.method === 'GET') {
      return this.auth.middleware(req, res, () => this.handleListTools(req, res));
    }

    if (path === '/tools/call' && req.method === 'POST') {
      return this.auth.middleware(req, res, () => this.handleCallTool(req, res));
    }

    if (path === '/events' && req.method === 'GET') {
      return this.auth.middleware(req, res, () => this.handleSSE(req, res));
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not found: ${req.method} ${path}` }));
  }

  // ── Route handlers ────────────────────────────────────────

  private handleInfo(_req: IncomingMessage, res: ServerResponse): void {
    const info = this.weaveLinkServer.getServerInfo();
    this.json(res, 200, {
      ...info,
      transport: 'http',
      uptime_ms: this.startTime ? Date.now() - this.startTime.getTime() : 0,
    });
  }

  private handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    this.json(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sse_clients: this.sseClients.size,
    });
  }

  private handleListTools(_req: IncomingMessage, res: ServerResponse): void {
    const tools = this.weaveLinkServer.listTools();
    this.json(res, 200, { tools, count: tools.length });
  }

  private handleCallTool(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req)
      .then(async (body) => {
        let parsed: { tool: string; args?: Record<string, unknown> };
        try {
          parsed = JSON.parse(body);
        } catch {
          this.json(res, 400, { error: 'Invalid JSON body' });
          return;
        }

        const { tool, args = {} } = parsed;

        if (!tool || typeof tool !== 'string') {
          this.json(res, 400, { error: 'Missing required field: tool' });
          return;
        }

        const result = await this.weaveLinkServer.callTool(tool, args);

        // Notify SSE clients of the tool invocation
        this.broadcast({
          event: 'tool_called',
          data: { tool, timestamp: new Date().toISOString() },
        });

        this.json(res, 200, result);
      })
      .catch((err) => {
        this.json(res, 500, { error: `Internal error: ${(err as Error).message}` });
      });
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send a welcome event
    this.sendSSE(res, 'connected', { clientId, serverTime: new Date().toISOString() });

    this.sseClients.set(clientId, { id: clientId, res });

    // Remove client on disconnect
    req.on('close', () => {
      this.sseClients.delete(clientId);
    });
  }

  // ── SSE helpers ───────────────────────────────────────────

  private sendSSE(res: ServerResponse, event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(payload);
  }

  /**
   * Broadcast a message to all connected SSE clients.
   */
  broadcast(message: { event: string; data: unknown }): void {
    if (this.sseClients.size === 0) return;
    const payload = `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
    const toRemove: string[] = [];

    for (const [id, client] of this.sseClients) {
      try {
        client.res.write(payload);
      } catch {
        // Client disconnected but didn't fire 'close' — clean up
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.sseClients.delete(id);
    }
  }

  // ── Utility ───────────────────────────────────────────────

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}
