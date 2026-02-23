/**
 * ExternalToolBridge
 *
 * Orchestrates tool discovery, manifest loading, adapter creation and
 * registration into any object that exposes a `register(name, handler)` API.
 *
 * This is the main entry point called from `AgentCore.init()`.
 *
 * Design:
 *   - Loads manifests from ToolLoader (local + npm)
 *   - Persists to ToolStore
 *   - Creates adapter handlers (HTTP / MCP / Script)
 *   - Registers prefixed action names into the provided registry
 */

import { createHttpAdapter } from './adapters/http-adapter.js';
import { createMcpAdapter } from './adapters/mcp-adapter.js';
import { createScriptAdapter } from './adapters/script-adapter.js';
import { loadAllManifests, type FsAdapter } from './tool-loader.js';
import { ToolStore } from './tool-store.js';
import {
  type ToolManifest,
  type ToolHandler,
  type RegisteredExternalTool,
  type ToolCallResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Registry interface (duck-typed to avoid coupling to agent-core)
// ---------------------------------------------------------------------------

export interface ToolRegistryLike {
  /** Register a new tool action */
  register(
    def: { name: string; description: string; parameters?: unknown },
    handler: (args: Record<string, unknown>) => Promise<ToolCallResult>,
  ): void;
}

// ---------------------------------------------------------------------------
// ExternalToolBridge
// ---------------------------------------------------------------------------

export class ExternalToolBridge {
  private readonly registeredTools: Map<string, RegisteredExternalTool> = new Map();
  private readonly store: ToolStore;
  private readonly projectRoot: string;

  constructor(projectRoot: string, store?: ToolStore) {
    this.projectRoot = projectRoot;
    this.store = store ?? new ToolStore(projectRoot);
  }

  // -------------------------------------------------------------------------

  private createHandlers(manifest: ToolManifest): Map<string, ToolHandler> {
    switch (manifest.adapter) {
      case 'http':
        return createHttpAdapter({ manifest });
      case 'mcp':
        return createMcpAdapter(manifest);
      case 'script':
        return createScriptAdapter(manifest);
      default:
        return new Map();
    }
  }

  /**
   * Register a single manifest and wire its handlers into the registry.
   */
  registerManifest(
    manifest: ToolManifest,
    registry?: ToolRegistryLike,
  ): RegisteredExternalTool {
    const handlers = this.createHandlers(manifest);
    const actionNames = Array.from(handlers.keys());

    const registered: RegisteredExternalTool = {
      manifest,
      actionNames,
      handlers,
      registeredAt: new Date().toISOString(),
    };

    this.registeredTools.set(manifest.id, registered);
    this.store.add(manifest);

    // Wire handlers into the registry (if provided)
    if (registry) {
      for (const action of manifest.tools) {
        const prefixedName = `${manifest.id}__${action.name}`;
        const handler = handlers.get(prefixedName);
        if (handler) {
          registry.register(
            {
              name: prefixedName,
              description: `[${manifest.name}] ${action.description}`,
            },
            handler,
          );
        }
      }
    }

    return registered;
  }

  /**
   * Load all manifests from disk and register them.
   * Called from AgentCore.init().
   */
  async loadAll(registry?: ToolRegistryLike, fs?: FsAdapter): Promise<{
    loaded: number;
    errors: Array<{ source: string; error: string }>;
  }> {
    const { manifests, errors } = loadAllManifests(this.projectRoot, fs);

    for (const manifest of manifests) {
      this.registerManifest(manifest, registry);
    }

    return { loaded: manifests.length, errors };
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  get(id: string): RegisteredExternalTool | undefined {
    return this.registeredTools.get(id);
  }

  list(): RegisteredExternalTool[] {
    return Array.from(this.registeredTools.values());
  }

  has(id: string): boolean {
    return this.registeredTools.has(id);
  }

  get size(): number {
    return this.registeredTools.size;
  }

  /** Remove a tool at runtime */
  unregister(id: string): boolean {
    const existed = this.registeredTools.delete(id);
    this.store.remove(id);
    return existed;
  }

  /**
   * Execute an action directly (useful when calling from the CLI `weave tools test`).
   */
  async execute(
    prefixedActionName: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    // Find which tool owns this action
    for (const reg of this.registeredTools.values()) {
      const handler = reg.handlers.get(prefixedActionName);
      if (handler) {
        return handler(args);
      }
    }
    return {
      toolId: 'unknown',
      action: prefixedActionName,
      success: false,
      error: `Action "${prefixedActionName}" not found in any registered tool`,
      durationMs: 0,
    };
  }
}
