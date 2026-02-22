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

/**
 * WeaveLink MCP Server
 * Implements Model Context Protocol for OpenWeave
 */
export class WeaveLinkServer {
  private config: MCPServerConfig;
  private sessions: Map<string, unknown> = new Map();

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
    };
  }

  /**
   * Initialize server (setup, load state, etc.)
   */
  async initialize(): Promise<void> {
    // Server initialization logic
    console.log(`[${this.config.name}] Initializing MCP server v${this.config.version}`);
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
    console.log(`[${this.config.name}] Executing tool: ${toolName}`, args);

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
      const { chat_id, node_id, node_label, node_type, metadata, frequency } = args;

      // Validate required fields
      if (!chat_id || !node_id || !node_label || !node_type) {
        return this.error("Missing required fields: chat_id, node_id, node_label, node_type");
      }

      // In a real implementation, this would save to the graph
      // For now, store in session cache
      const session = this.getOrCreateSession(chat_id);
      (session as Record<string, unknown>).lastNode = {
        id: node_id,
        label: node_label,
        type: node_type,
        metadata,
        frequency: frequency || 1,
      };

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

      // Mock results for demonstration
      const results: QueryResult[] = [
        {
          node_id: "concept-1",
          label: query,
          type: "CONCEPT",
          frequency: 10,
          score: 0.95,
        },
        {
          node_id: "decision-1",
          label: `Decide on ${query}`,
          type: "DECISION",
          frequency: 5,
          score: 0.78,
        },
      ].slice(0, limit);

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

      return this.success({
        message: "Error suppressed and correction created",
        error_node_id: node_id,
        correction_node_id: `correction-${Date.now()}`,
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

      // Mock context for demonstration
      const context: ContextWindow = {
        total_nodes: 5,
        total_edges: 8,
        context_size_bytes: 2048,
        context_usage_percent: 42,
        nodes: [
          {
            node_id: "concept-1",
            label: "Project Goal",
            type: "CONCEPT",
            frequency: 15,
            score: 1.0,
          },
        ],
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

      return this.success({
        sub_task_id: "M1-1",
        milestone_id: "M1",
        title: "Implement core data model",
        description: "Design and implement basic node/edge structures",
        estimated_hours: 5,
        priority: "CRITICAL",
        reason: "First task in the sequence",
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
   * Helper: get or create session
   */
  private getOrCreateSession(chatId: string): unknown {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, {
        created_at: new Date(),
        nodes: [],
        edges: [],
      });
    }
    return this.sessions.get(chatId);
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
