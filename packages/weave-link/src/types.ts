/**
 * WeaveLink MCP Server Types
 */

/**
 * Tool argument structures for MCP protocol
 */
export interface SaveNodeArgs {
  chat_id: string;
  node_id: string;
  node_label: string;
  node_type: "CONCEPT" | "DECISION" | "MILESTONE" | "ERROR" | "CORRECTION" | "CODE_ENTITY";
  metadata?: Record<string, unknown>;
  frequency?: number;
}

export interface QueryGraphArgs {
  chat_id: string;
  query: string;
  limit?: number;
}

export interface SuppressNodeArgs {
  chat_id: string;
  node_id: string;
  error_label: string;
  description: string;
}

export interface UpdateRoadmapArgs {
  chat_id: string;
  milestone_id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "DEFERRED";
  actual_hours?: number;
}

export interface GetSessionContextArgs {
  chat_id: string;
  max_depth?: number;
  include_archived?: boolean;
}

export interface QueryResult {
  node_id: string;
  label: string;
  type: string;
  frequency: number;
  score: number;
}

export interface ContextWindow {
  total_nodes: number;
  total_edges: number;
  context_size_bytes: number;
  context_usage_percent: number;
  nodes: QueryResult[];
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  name?: string;
  version?: string;
  description?: string;
  capabilities?: {
    tools?: {
      listChanged?: boolean;
    };
  };
  /** Directory where graph data is persisted. Defaults to <cwd>/.weave */
  dataDir?: string;
}

/**
 * Response wrapper for MCP results
 */
export interface MCPResponse<T> {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: T;
  }>;
}
