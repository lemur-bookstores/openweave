import * as path from 'node:path';
import {
  SaveNodeArgs,
  QueryGraphArgs,
  SuppressNodeArgs,
  UpdateRoadmapArgs,
  GetSessionContextArgs,
  MCPServerConfig,
  MCPResponse,
  MCPTool,
  ContextWindow,
  QueryResult,
} from "./types";
import { ALL_TOOLS, getTool } from "./tools";
import {
  PersistenceManager,
  NodeType,
  EdgeType,
  NodeBuilder,
  EdgeBuilder,
} from "@openweave/weave-graph";

/**
 * WeaveLink MCP Server
 * Implements Model Context Protocol for OpenWeave
 */

// ── Security helpers (VULN-002, VULN-004) ────────────────────────────────────

const SAFE_ID_RE = /^[\w\-]{1,128}$/;
const ALLOWED_NODE_TYPES = new Set([
  'CONCEPT', 'DECISION', 'MILESTONE', 'ERROR', 'CORRECTION', 'CODE_ENTITY',
]);

function validateIdentifier(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string' || !SAFE_ID_RE.test(value)) {
    return `${fieldName} must be 1–128 alphanumeric/hyphen/underscore characters`;
  }
  return null;
}

function validateSaveNodeArgs(args: Record<string, unknown>): string | null {
  const idErr =
    validateIdentifier(args.chat_id, 'chat_id') ??
    validateIdentifier(args.node_id, 'node_id');
  if (idErr) return idErr;

  if (typeof args.node_label !== 'string' || args.node_label.trim().length === 0) {
    return 'node_label must be a non-empty string';
  }
  if (args.node_label.length > 1024) {
    return 'node_label must not exceed 1024 characters';
  }
  if (!ALLOWED_NODE_TYPES.has(String(args.node_type))) {
    return `node_type must be one of: ${[...ALLOWED_NODE_TYPES].join(', ')}`;
  }
  if (args.frequency !== undefined) {
    const f = Number(args.frequency);
    if (!Number.isFinite(f) || f < 1 || f > 10_000) {
      return 'frequency must be a number between 1 and 10000';
    }
  }
  if (args.metadata !== null && args.metadata !== undefined) {
    if (typeof args.metadata !== 'object' || Array.isArray(args.metadata)) {
      return 'metadata must be a plain object';
    }
    const meta = args.metadata as Record<string, unknown>;
    const keys = Object.keys(meta);
    if (keys.length > 20) return 'metadata must not have more than 20 keys';
    for (const key of keys) {
      if (key.startsWith('__')) return `metadata key '${key}' is not allowed`;
      if (typeof meta[key] !== 'string' && typeof meta[key] !== 'number' && typeof meta[key] !== 'boolean') {
        return `metadata['${key}'] must be a string, number or boolean`;
      }
      if (typeof meta[key] === 'string' && (meta[key] as string).length > 512) {
        return `metadata['${key}'] must not exceed 512 characters`;
      }
    }
  }
  return null;
}

export class WeaveLinkServer {
  private config: MCPServerConfig;
  private persistence: PersistenceManager;

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      name: config.name || "WeaveLink",
      version: config.version || "0.1.0",
      description: config.description || "MCP server for OpenWeave knowledge graph and planning",
      capabilities: config.capabilities || {
        tools: {
          listChanged: true,
        },
      },
      dataDir: config.dataDir || path.join(process.cwd(), '.weave'),
    };
    this.persistence = new PersistenceManager(this.config.dataDir!);
  }

  /**
   * Initialize server (setup, load state, etc.)
   */
  async initialize(): Promise<void> {
    await this.persistence.ensureDataDir();
    console.log(`[${this.config.name}] Initializing MCP server v${this.config.version} — dataDir: ${this.config.dataDir}`);
  }

  /**
   * List available tools
   */
  listTools(): MCPTool[] {
    return ALL_TOOLS;
  }

  /**
   * Get tool by name
   */
  getTool(name: string): MCPTool | undefined {
    return getTool(name);
  }

  /**
   * Handle tool call
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPResponse<unknown>> {
    // VULN-001: log only a safe summary — never raw args (may contain PII or secrets)
    console.log(`[${this.config.name}] Executing tool: ${toolName} | chat_id: ${String(args.chat_id ?? '—')}`);

    // Route to appropriate handler
    switch (toolName) {
      case "save_node":
        return this.handleSaveNode(args as unknown as SaveNodeArgs);
      case "query_graph":
        return this.handleQueryGraph(args as unknown as QueryGraphArgs);
      case "suppress_error":
        return this.handleSuppressError(args as unknown as SuppressNodeArgs);
      case "update_roadmap":
        return this.handleUpdateRoadmap(args as unknown as UpdateRoadmapArgs);
      case "get_session_context":
        return this.handleGetSessionContext(args as unknown as GetSessionContextArgs);
      case "get_next_action":
        return this.handleGetNextAction(args as Record<string, string>);
      case "list_orphans":
        return this.handleListOrphans(args as Record<string, unknown>);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Handler: save_node
   */
  private async handleSaveNode(args: SaveNodeArgs): Promise<MCPResponse<unknown>> {
    try {
      // VULN-002: runtime validation before any type cast or storage
      const validationError = validateSaveNodeArgs(args as unknown as Record<string, unknown>);
      if (validationError) {
        return this.error(`Validation error: ${validationError}`);
      }

      const { chat_id, node_id, node_label, node_type, metadata, frequency } = args;

      const graph = await this.persistence.loadOrCreateGraph(chat_id);

      // Upsert: update if node_id already exists, otherwise create
      const existing = graph.getNode(node_id);
      if (existing) {
        graph.updateNode(node_id, {
          label: node_label,
          type: node_type as NodeType,
          metadata: metadata ?? existing.metadata,
          frequency: frequency ?? existing.frequency,
          updatedAt: new Date(),
        });
      } else {
        const node = NodeBuilder.create(
          node_type as NodeType,
          node_label,
          undefined,
          metadata,
        );
        // Override the auto-generated id with the caller-provided one
        graph.addNode({ ...node, id: node_id, frequency: frequency ?? 1 });
      }

      await this.persistence.saveGraph(graph.snapshot());

      return this.success({
        message: "Node saved successfully",
        node_id,
        chat_id,
      });
    } catch (error) {
      return this.error(`Failed to save node: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: query_graph
   */
  private async handleQueryGraph(args: QueryGraphArgs): Promise<MCPResponse<unknown>> {
    try {
      const { chat_id, query, limit = 10 } = args;

      if (!chat_id || !query) {
        return this.error("Missing required fields: chat_id, query");
      }

      const graph = await this.persistence.loadOrCreateGraph(chat_id);
      const nodes = graph.queryNodesByLabel(query).slice(0, limit);

      const results: QueryResult[] = nodes.map((n) => ({
        node_id: n.id,
        label: n.label,
        type: n.type,
        frequency: n.frequency ?? 1,
        score: 1.0, // weave-graph doesn't expose scores yet; use 1.0 as placeholder
      }));

      return this.success({
        query,
        results,
        total: results.length,
      });
    } catch (error) {
      return this.error(`Query failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: suppress_error
   */
  private async handleSuppressError(args: SuppressNodeArgs): Promise<MCPResponse<unknown>> {
    try {
      const { chat_id, node_id, error_label, description } = args;

      if (!chat_id || !node_id || !error_label || !description) {
        return this.error(
          "Missing required fields: chat_id, node_id, error_label, description"
        );
      }

      const graph = await this.persistence.loadOrCreateGraph(chat_id);

      // Ensure the ERROR node exists
      if (!graph.getNode(node_id)) {
        graph.addNode({ ...NodeBuilder.error(error_label, description), id: node_id });
      }

      // Create a CORRECTION node linked to the error
      const correctionId = `correction-${Date.now()}`;
      const correctionNode = NodeBuilder.correction(
        `Correction: ${error_label}`,
        description,
      );
      graph.addNode({ ...correctionNode, id: correctionId });

      // Edge: CORRECTION corrects ERROR
      graph.addEdge(EdgeBuilder.create(correctionId, node_id, EdgeType.CORRECTS));

      await this.persistence.saveGraph(graph.snapshot());

      return this.success({
        message: "Error suppressed and correction created",
        error_node_id: node_id,
        correction_node_id: correctionId,
        error_label,
      });
    } catch (error) {
      return this.error(`Error suppression failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: update_roadmap
   */
  private async handleUpdateRoadmap(args: UpdateRoadmapArgs): Promise<MCPResponse<unknown>> {
    try {
      const { chat_id, milestone_id, status, actual_hours } = args;

      if (!chat_id || !milestone_id || !status) {
        return this.error("Missing required fields: chat_id, milestone_id, status");
      }

      const graph = await this.persistence.loadOrCreateGraph(chat_id);

      const node = graph.getNode(milestone_id);
      if (!node) {
        return this.error(`Milestone node '${milestone_id}' not found in graph for chat '${chat_id}'`);
      }

      graph.updateNode(milestone_id, {
        metadata: {
          ...node.metadata,
          status,
          actual_hours: actual_hours ?? 0,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      });

      await this.persistence.saveGraph(graph.snapshot());

      return this.success({
        message: "Milestone updated",
        milestone_id,
        status,
        actual_hours: actual_hours || 0,
      });
    } catch (error) {
      return this.error(`Roadmap update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: get_session_context
   */
  private async handleGetSessionContext(
    args: GetSessionContextArgs
  ): Promise<MCPResponse<unknown>> {
    try {
      const { chat_id } = args;

      if (!chat_id) {
        return this.error("Missing required field: chat_id");
      }

      const graph = await this.persistence.loadOrCreateGraph(chat_id);
      const stats = graph.getStats();
      const snapshot = graph.snapshot();

      const nodes: QueryResult[] = Object.values(snapshot.nodes)
        .sort((a, b) => (b.frequency ?? 1) - (a.frequency ?? 1))
        .slice(0, 20)
        .map((n) => ({
          node_id: n.id,
          label: n.label,
          type: n.type,
          frequency: n.frequency ?? 1,
          score: 1.0,
        }));

      const context: ContextWindow = {
        total_nodes: stats.totalNodes,
        total_edges: stats.totalEdges,
        context_size_bytes: JSON.stringify(snapshot).length,
        context_usage_percent: Math.min(100, Math.round((stats.totalNodes / 500) * 100)),
        nodes,
      };

      return this.success(context);
    } catch (error) {
      return this.error(`Context retrieval failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: get_next_action
   */
  private async handleGetNextAction(args: Record<string, string>): Promise<MCPResponse<unknown>> {
    try {
      const { chat_id } = args;

      if (!chat_id) {
        return this.error("Missing required field: chat_id");
      }

      const graph = await this.persistence.loadOrCreateGraph(chat_id);
      const milestones = graph.queryNodesByType(NodeType.MILESTONE);

      // Return the first MILESTONE whose metadata.status is not 'DONE'
      const next = milestones.find(
        (n) => !n.metadata || n.metadata['status'] !== 'DONE',
      );

      if (!next) {
        return this.success({
          message: 'No pending milestones found',
          milestones: milestones.map((m) => ({ node_id: m.id, label: m.label, status: m.metadata?.['status'] ?? 'PENDING' })),
        });
      }

      return this.success({
        sub_task_id: next.id,
        milestone_id: next.id,
        title: next.label,
        description: next.description ?? '',
        estimated_hours: Number(next.metadata?.['estimated_hours'] ?? 0),
        priority: String(next.metadata?.['priority'] ?? 'NORMAL'),
        reason: 'Next unresolved milestone in graph',
      });
    } catch (error) {
      return this.error(`Failed to get next action: ${(error as Error).message}`);
    }
  }

  /**
   * Handler: list_orphans
   */
  private async handleListOrphans(args: Record<string, unknown>): Promise<MCPResponse<unknown>> {
    try {
      const { project_path, min_severity = "MEDIUM" } = args;

      if (!project_path) {
        return this.error("Missing required field: project_path");
      }

      // Mock orphan detection results
      return this.success({
        project_path,
        min_severity,
        orphans_found: 3,
        orphans: [
          {
            id: "unused-function-1",
            name: "oldHelper",
            type: "FUNCTION",
            severity: "HIGH",
            file: "src/utils.ts",
            line: 42,
          },
        ],
      });
    } catch (error) {
      return this.error(`Orphan detection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Helper: success response
   */
  private success(data: unknown): MCPResponse<unknown> {
    return {
      content: [
        {
          type: "text",
          data,
        },
      ],
    };
  }

  /**
   * Helper: error response
   */
  private error(message: string): MCPResponse<unknown> {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
    };
  }

  /**
   * Get server info
   */
  getServerInfo() {
    return {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    };
  }
}
