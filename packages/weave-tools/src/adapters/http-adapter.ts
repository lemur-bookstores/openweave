/**
 * HTTP Adapter
 *
 * Routes tool calls to a REST/webhook endpoint.
 * Supports bearer token, api-key, basic, and no-auth strategies.
 * Injectable fetch for test isolation.
 */

import type { ToolManifest, ToolCallResult, ToolHandler, ToolAuth } from '../types.js';

// ---------------------------------------------------------------------------
// Auth header builder
// ---------------------------------------------------------------------------

export function buildAuthHeaders(auth: ToolAuth | undefined): Record<string, string> {
  if (!auth || auth.type === 'none') return {};

  const credential = auth.envVar ? (process.env[auth.envVar] ?? '') : '';

  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${credential}` };
    case 'api-key': {
      const headerName = auth.headerName ?? 'X-API-Key';
      return { [headerName]: credential };
    }
    case 'basic': {
      const encoded = Buffer.from(credential).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// HTTP adapter factory
// ---------------------------------------------------------------------------

export type FetchFn = typeof fetch;

export interface HttpAdapterOptions {
  manifest: ToolManifest;
  /** Injectable fetch implementation for tests */
  fetchFn?: FetchFn;
}

export function createHttpHandler(
  manifest: ToolManifest,
  actionName: string,
  fetchFn: FetchFn = fetch,
): ToolHandler {
  const endpoint = manifest.endpoint!;
  const timeoutMs = manifest.timeout_ms ?? 10_000;

  return async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const start = Date.now();
    const prefixedName = `${manifest.id}__${actionName}`;

    try {
      const authHeaders = buildAuthHeaders(manifest.auth);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(`${endpoint}/tools/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ name: actionName, arguments: args }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          toolId: manifest.id,
          action: prefixedName,
          success: false,
          error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
          durationMs: Date.now() - start,
        };
      }

      const data: unknown = await response.json();
      return {
        toolId: manifest.id,
        action: prefixedName,
        success: true,
        data,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        toolId: manifest.id,
        action: prefixedName,
        success: false,
        error: msg.includes('abort') ? `Timeout after ${timeoutMs}ms` : msg,
        durationMs: Date.now() - start,
      };
    }
  };
}

export function createHttpAdapter(opts: HttpAdapterOptions): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  for (const action of opts.manifest.tools) {
    const prefixedName = `${opts.manifest.id}__${action.name}`;
    handlers.set(prefixedName, createHttpHandler(opts.manifest, action.name, opts.fetchFn));
  }
  return handlers;
}
