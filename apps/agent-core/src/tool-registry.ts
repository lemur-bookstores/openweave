/**
 * ToolRegistry
 *
 * Central registry that maps tool names to:
 *   - A JSON-Schema `ToolDefinition` (sent to the LLM)
 *   - A `ToolHandler` async function (executed locally)
 *
 * By default the registry ships with the seven canonical OpenWeave
 * tools.  Additional tools can be registered at runtime.
 */

import {
  ToolDefinition,
  ToolHandler,
  ToolExecutionContext,
  ToolResult,
  PendingToolCall,
} from './types.js';

// ──────────────────────────────────────────────────────────
// Built-in tool definitions (schema mirrors WeaveLink tools)
// ──────────────────────────────────────────────────────────

const TOOL_SAVE_NODE: ToolDefinition = {
  name: 'save_node',
  description: 'Add or update a node in the WeaveGraph knowledge graph.',
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'Unique node identifier' },
      node_label: { type: 'string', description: 'Human-readable label' },
      node_type: {
        type: 'string',
        enum: ['CONCEPT', 'DECISION', 'MILESTONE', 'ERROR', 'CORRECTION', 'CODE_ENTITY'],
      },
      metadata: { type: 'object', description: 'Optional key-value metadata' },
      frequency: { type: 'number', description: 'Access frequency hint 0-100' },
    },
    required: ['node_id', 'node_label', 'node_type'],
  },
};

const TOOL_QUERY_GRAPH: ToolDefinition = {
  name: 'query_graph',
  description: 'Search WeaveGraph nodes by keyword.  Returns ranked results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword / phrase' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['query'],
  },
};

const TOOL_SUPPRESS_ERROR: ToolDefinition = {
  name: 'suppress_error',
  description: 'Mark an ERROR node as corrected and record the fix.',
  inputSchema: {
    type: 'object',
    properties: {
      error_node_id: { type: 'string', description: 'ID of the ERROR node' },
      correction_label: { type: 'string', description: 'Description of the fix applied' },
    },
    required: ['error_node_id', 'correction_label'],
  },
};

const TOOL_UPDATE_ROADMAP: ToolDefinition = {
  name: 'update_roadmap',
  description: 'Update the status of a MILESTONE node.',
  inputSchema: {
    type: 'object',
    properties: {
      milestone_id: { type: 'string' },
      status: {
        type: 'string',
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'DEFERRED'],
      },
      notes: { type: 'string', description: 'Optional progress notes' },
    },
    required: ['milestone_id', 'status'],
  },
};

const TOOL_GET_SESSION_CONTEXT: ToolDefinition = {
  name: 'get_session_context',
  description: 'Retrieve the full current session context snapshot from WeaveGraph.',
  inputSchema: {
    type: 'object',
    properties: {
      max_nodes: { type: 'number', description: 'Max nodes to include (default 50)' },
    },
    required: [],
  },
};

const TOOL_GET_NEXT_ACTION: ToolDefinition = {
  name: 'get_next_action',
  description: 'Ask WeavePath for the highest-priority next sub-task to work on.',
  inputSchema: {
    type: 'object',
    properties: {
      milestone_filter: {
        type: 'string',
        description: 'Optional milestone ID to scope the query',
      },
    },
    required: [],
  },
};

const TOOL_LIST_ORPHANS: ToolDefinition = {
  name: 'list_orphans',
  description: 'Surface disconnected or stale nodes in the knowledge graph.',
  inputSchema: {
    type: 'object',
    properties: {
      severity_filter: {
        type: 'string',
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
        description: 'Only return orphans at or above this severity',
      },
    },
    required: [],
  },
};

export const BUILTIN_TOOLS: ToolDefinition[] = [
  TOOL_SAVE_NODE,
  TOOL_QUERY_GRAPH,
  TOOL_SUPPRESS_ERROR,
  TOOL_UPDATE_ROADMAP,
  TOOL_GET_SESSION_CONTEXT,
  TOOL_GET_NEXT_ACTION,
  TOOL_LIST_ORPHANS,
];

// ──────────────────────────────────────────────────────────
// ToolRegistry
// ──────────────────────────────────────────────────────────

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    // Register no-op built-ins so LLM sees the schemas.
    // In production, callers replace these with real implementations
    // that talk to WeaveLink / WeaveGraph / WeavePath.
    for (const def of BUILTIN_TOOLS) {
      this.register(def, ToolRegistry.noopHandler(def.name));
    }
  }

  // ── Registration ──────────────────────────────────────────

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Replace the handler for an existing tool without changing its schema.
   * Throws if the tool is not registered.
   */
  bindHandler(name: string, handler: ToolHandler): void {
    const existing = this.tools.get(name);
    if (!existing) {
      throw new Error(`ToolRegistry: unknown tool "${name}"`);
    }
    this.tools.set(name, { ...existing, handler });
  }

  // ── Lookup ────────────────────────────────────────────────

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  get size(): number {
    return this.tools.size;
  }

  // ── Execution ─────────────────────────────────────────────

  async execute(
    call: PendingToolCall,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const registered = this.tools.get(call.name);
    const executedAt = new Date().toISOString();

    if (!registered) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: null,
        isError: true,
        errorMessage: `Tool "${call.name}" is not registered.`,
        executedAt,
      };
    }

    try {
      const output = await registered.handler(call.args, context);
      return { toolCallId: call.id, name: call.name, output, isError: false, executedAt };
    } catch (err) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: null,
        isError: true,
        errorMessage: (err as Error).message,
        executedAt,
      };
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private static noopHandler(name: string): ToolHandler {
    return async (_args, _ctx) => ({
      tool: name,
      status: 'noop',
      message: `Tool "${name}" has no bound handler. Bind one via registry.bindHandler().`,
    });
  }
}
