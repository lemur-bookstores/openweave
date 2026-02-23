import { MCPTool } from "./types";

/**
 * Tool Definitions for WeaveLink MCP Server
 * Defines the interface for all available tools
 */

/**
 * save_node: Add or update a node in the knowledge graph
 */
export const TOOL_SAVE_NODE: MCPTool = {
  name: "save_node",
  description:
    "Add or update a node in the WeaveGraph knowledge base. Nodes represent concepts, decisions, milestones, or errors.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        pattern: "^[\\w\\-]{1,128}$",
        description: "Session identifier (alphanumeric + hyphens/underscores, max 128 chars)",
      },
      node_id: {
        type: "string",
        pattern: "^[\\w\\-]{1,128}$",
        description: "Unique identifier for the node within this session (alphanumeric + hyphens/underscores, max 128 chars)",
      },
      node_label: {
        type: "string",
        maxLength: 1024,
        description: "Human-readable label for the node",
      },
      node_type: {
        type: "string",
        enum: ["CONCEPT", "DECISION", "MILESTONE", "ERROR", "CORRECTION", "CODE_ENTITY"],
        description: "Type of knowledge stored in this node",
      },
      metadata: {
        type: "object",
        additionalProperties: { type: "string", maxLength: 512 },
        maxProperties: 20,
        description: "Optional key/value string pairs (max 20 keys, 512 chars per value)",
      },
      frequency: {
        type: "number",
        minimum: 1,
        maximum: 10000,
        description: "Access frequency hint (1-10000) for context compression prioritization",
      },
    },
    required: ["chat_id", "node_id", "node_label", "node_type"],
  },
};

/**
 * query_graph: Search the knowledge graph by keyword
 */
export const TOOL_QUERY_GRAPH: MCPTool = {
  name: "query_graph",
  description:
    "Search the WeaveGraph for nodes matching a keyword or topic. Returns ranked results by relevance.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        pattern: "^[\\w\\-]{1,128}$",
        description: "Session identifier",
      },
      query: {
        type: "string",
        maxLength: 512,
        description: "Search query (supports keywords, labels, or partial matches)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["chat_id", "query"],
  },
};

/**
 * suppress_error: Mark an error node and create a correction
 */
export const TOOL_SUPPRESS_ERROR: MCPTool = {
  name: "suppress_error",
  description:
    "Flag an ERROR node as suppressed and link it to a CORRECTION node. Helps the agent learn from mistakes.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        pattern: "^[\\w\\-]{1,128}$",
        description: "Session identifier",
      },
      node_id: {
        type: "string",
        pattern: "^[\\w\\-]{1,128}$",
        description: "ID of the ERROR node to suppress",
      },
      error_label: {
        type: "string",
        maxLength: 512,
        description: "Short label for the error",
      },
      description: {
        type: "string",
        maxLength: 2048,
        description: "Description of the correction applied",
      },
    },
    required: ["chat_id", "node_id", "error_label", "description"],
  },
};

/**
 * update_roadmap: Update milestone status and hours
 */
export const TOOL_UPDATE_ROADMAP: MCPTool = {
  name: "update_roadmap",
  description:
    "Update the status of a milestone in the current roadmap. Tracks progress and actual hours spent.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        description: "Session identifier",
      },
      milestone_id: {
        type: "string",
        description: "Milestone identifier (e.g., 'M1', 'M2')",
      },
      status: {
        type: "string",
        enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "DEFERRED"],
        description: "New status for the milestone",
      },
      actual_hours: {
        type: "number",
        description: "Optional: hours actually spent on this milestone",
      },
    },
    required: ["chat_id", "milestone_id", "status"],
  },
};

/**
 * get_session_context: Retrieve full session context
 */
export const TOOL_GET_SESSION_CONTEXT: MCPTool = {
  name: "get_session_context",
  description:
    "Retrieve the full knowledge graph context for a session, including all nodes, edges, and current milestones.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        description: "Session identifier",
      },
      max_depth: {
        type: "number",
        description: "Maximum graph traversal depth (default: 2)",
      },
      include_archived: {
        type: "boolean",
        description: "Include archived/compressed nodes (default: false)",
      },
    },
    required: ["chat_id"],
  },
};

/**
 * get_next_action: Get the next recommended sub-task
 */
export const TOOL_GET_NEXT_ACTION: MCPTool = {
  name: "get_next_action",
  description:
    "Get the next recommended actionable sub-task based on the current roadmap and dependencies.",
  inputSchema: {
    type: "object",
    properties: {
      chat_id: {
        type: "string",
        description: "Session identifier",
      },
    },
    required: ["chat_id"],
  },
};

/**
 * list_orphans: Find unused code entities in a project
 */
export const TOOL_LIST_ORPHANS: MCPTool = {
  name: "list_orphans",
  description:
    "Run orphan detection on a codebase and return list of unused functions, classes, and modules.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: {
        type: "string",
        description: "Path to project root to analyze",
      },
      min_severity: {
        type: "string",
        enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
        description: "Minimum severity level to report (default: MEDIUM)",
      },
      include_tests: {
        type: "boolean",
        description: "Include test files in analysis (default: false)",
      },
    },
    required: ["project_path"],
  },
};

/**
 * All available tools
 */
export const ALL_TOOLS: MCPTool[] = [
  TOOL_SAVE_NODE,
  TOOL_QUERY_GRAPH,
  TOOL_SUPPRESS_ERROR,
  TOOL_UPDATE_ROADMAP,
  TOOL_GET_SESSION_CONTEXT,
  TOOL_GET_NEXT_ACTION,
  TOOL_LIST_ORPHANS,
];

/**
 * Get tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
