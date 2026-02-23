/**
 * MCP Adapter
 *
 * Routes tool calls to an external MCP server (HTTP transport).
 * Sends POST /tools/call in MCP JSON-RPC style and reads the result.
 * For stdio MCP servers, users should set endpoint to the HTTP bridge URL.
 *
 * Injectable fetch for test isolation.
 */

import type { ToolManifest, ToolCallResult, ToolHandler } from '../types.js';
import { buildAuthHeaders, type FetchFn } from './http-adapter.js';

// ---------------------------------------------------------------------------
// MCP request/response shapes (minimal subset)
// ---------------------------------------------------------------------------

interface McpToolCallRequest {
  jsonrpc: '2.0';
  id: number;
  method: 'tools/call';
  params: { name: string; arguments: Record<string, unknown> };
}

interface McpToolCallResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

// ---------------------------------------------------------------------------
// MCP handler factory
// ---------------------------------------------------------------------------

let _mcpRequestId = 1;

export function createMcpHandler(
  manifest: ToolManifest,
  actionName: string,
  fetchFn: FetchFn = fetch,
): ToolHandler {
  const endpoint = manifest.endpoint!;
  const timeoutMs = manifest.timeout_ms ?? 10_000;

  return async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const start = Date.now();
    const prefixedName = `${manifest.id}__${actionName}`;
    const requestId = _mcpRequestId++;

    const body: McpToolCallRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: { name: actionName, arguments: args },
    };

    try {
      const authHeaders = buildAuthHeaders(manifest.auth);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify(body),
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
          error: `MCP HTTP ${response.status}: ${text.slice(0, 200)}`,
          durationMs: Date.now() - start,
        };
      }

      const rpc = (await response.json()) as McpToolCallResponse;

      if (rpc.error) {
        return {
          toolId: manifest.id,
          action: prefixedName,
          success: false,
          error: `MCP error ${rpc.error.code}: ${rpc.error.message}`,
          durationMs: Date.now() - start,
        };
      }

      const result = rpc.result;
      if (!result) {
        return {
          toolId: manifest.id,
          action: prefixedName,
          success: true,
          data: null,
          durationMs: Date.now() - start,
        };
      }

      // Extract text content from MCP content array
      const textContent = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n');

      let parsedData: unknown = textContent;
      try {
        parsedData = JSON.parse(textContent);
      } catch {
        // keep as string
      }

      return {
        toolId: manifest.id,
        action: prefixedName,
        success: !result.isError,
        data: parsedData,
        error: result.isError ? String(parsedData) : undefined,
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

export function createMcpAdapter(
  manifest: ToolManifest,
  fetchFn: FetchFn = fetch,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  for (const action of manifest.tools) {
    const prefixedName = `${manifest.id}__${action.name}`;
    handlers.set(prefixedName, createMcpHandler(manifest, action.name, fetchFn));
  }
  return handlers;
}
