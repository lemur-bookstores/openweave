/**
 * Shared type definitions for the OpenWeave VS Code extension.
 * These mirror the weave-graph / weave-link domain but are kept local
 * so the extension does NOT import runtime packages — only devDependencies.
 */

// ---------------------------------------------------------------------------
// Graph primitives
// ---------------------------------------------------------------------------

export type NodeType =
  | 'CONCEPT'
  | 'DECISION'
  | 'MILESTONE'
  | 'ERROR'
  | 'CORRECTION'
  | 'CODE_ENTITY';

export interface WeaveNode {
  id: string;
  label: string;
  type: NodeType;
  description?: string;
  metadata?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeaveEdge {
  source: string;
  target: string;
  relation: string;
  weight?: number;
}

export interface GraphSnapshot {
  nodes: WeaveNode[];
  edges: WeaveEdge[];
  nodeCount: number;
  edgeCount: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  name?: string;
  provider: string;
  nodeCount: number;
  startedAt: string;
  lastActiveAt?: string;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export type MilestoneStatus = 'completed' | 'in-progress' | 'not-started' | 'blocked';

export interface MilestoneItem {
  id: string;
  title: string;
  status: MilestoneStatus;
  phase?: string;
  subtasks?: SubtaskItem[];
}

export interface SubtaskItem {
  id: string;
  title: string;
  status: MilestoneStatus;
  parentId: string;
}

// ---------------------------------------------------------------------------
// Server / health
// ---------------------------------------------------------------------------

export type ServerState = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ServerStatus {
  state: ServerState;
  url: string;
  version?: string;
  uptime?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// MCP tool call helpers
// ---------------------------------------------------------------------------

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Webview messages
// ---------------------------------------------------------------------------

export type WebviewToExtMessage =
  | { type: 'nodeClicked'; nodeId: string }
  | { type: 'edgeClicked'; source: string; target: string }
  | { type: 'ready' };

export type ExtToWebviewMessage =
  | { type: 'graphUpdate'; snapshot: GraphSnapshot }
  | { type: 'theme'; isDark: boolean };
