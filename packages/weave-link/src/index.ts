/**
 * WeaveLink - MCP Server
 * Model Context Protocol server for integrating WeaveGraph with AI clients
 */

// Re-export all types and classes
export * from "./types";
export { ALL_TOOLS, getTool, TOOL_SAVE_NODE, TOOL_QUERY_GRAPH, TOOL_SUPPRESS_ERROR, TOOL_UPDATE_ROADMAP, TOOL_GET_SESSION_CONTEXT, TOOL_GET_NEXT_ACTION, TOOL_LIST_ORPHANS } from "./tools";
export { WeaveLinkServer } from "./mcp-server";

export const version = "0.1.0";