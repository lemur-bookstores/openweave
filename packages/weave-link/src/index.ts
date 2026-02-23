/**
 * WeaveLink - MCP Server
 * Model Context Protocol server for integrating WeaveGraph with AI clients
 */

// Core MCP server
export * from './types';
export {
  ALL_TOOLS,
  getTool,
  TOOL_SAVE_NODE,
  TOOL_QUERY_GRAPH,
  TOOL_SUPPRESS_ERROR,
  TOOL_UPDATE_ROADMAP,
  TOOL_GET_SESSION_CONTEXT,
  TOOL_GET_NEXT_ACTION,
  TOOL_LIST_ORPHANS,
} from './tools';
export { WeaveLinkServer } from './mcp-server';

// M9 · Remote WeaveLink
export { AuthManager, generateApiKey } from './auth';
export type { AuthConfig, AuthResult } from './auth';
export { HttpTransport } from './http-transport';
export type { HttpTransportConfig } from './http-transport';

// M8 · Client Integrations
export { ConfigGenerator } from './installer/config-generator';
export type { WeaveLinkConfig, MCPClientEntry, MCPClientsConfig } from './installer/config-generator';
export { ClaudeDesktopInstaller } from './installer/claude-desktop';
export type { InstallResult } from './installer/claude-desktop';
export { CursorInstaller } from './installer/cursor';
export type { CursorInstallResult, CursorScope } from './installer/cursor';

export const version = '0.2.0';
