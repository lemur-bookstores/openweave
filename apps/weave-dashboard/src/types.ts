/**
 * Weave Dashboard — Shared Types
 *
 * Self-contained mirrors of the key shapes from WeaveGraph / WeavePath so
 * the dashboard has no workspace-package runtime dependencies.
 */

// ── Graph (mirrors WeaveGraph) ──────────────────────────────────────────

export type NodeType =
  | 'CONCEPT'
  | 'DECISION'
  | 'MILESTONE'
  | 'ERROR'
  | 'CORRECTION'
  | 'CODE_ENTITY';

export type EdgeType =
  | 'RELATES'
  | 'CAUSES'
  | 'CORRECTS'
  | 'IMPLEMENTS'
  | 'DEPENDS_ON'
  | 'BLOCKS';

export interface DashboardNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  frequency: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface GraphSnapshot {
  nodes: Record<string, DashboardNode>;
  edges: Record<string, DashboardEdge>;
  metadata: {
    chatId: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    compressionThreshold: number;
  };
}

// ── Layout ──────────────────────────────────────────────────────────────

export interface LayoutNode extends DashboardNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface LayoutEdge extends DashboardEdge {
  source: LayoutNode;
  target: LayoutNode;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

// ── Session Diff ─────────────────────────────────────────────────────────

export interface DiffEntry {
  id: string;
  label: string;
  type: NodeType | EdgeType;
}

export interface GraphDiff {
  sessionA: string;
  sessionB: string;
  addedNodes: DiffEntry[];
  removedNodes: DiffEntry[];
  changedNodes: Array<DiffEntry & { changes: string[] }>;
  addedEdges: DiffEntry[];
  removedEdges: DiffEntry[];
  stats: {
    totalChanges: number;
    similarity: number; // 0–1
  };
}

// ── Milestones (mirrors WeavePath) ───────────────────────────────────────

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'DEFERRED';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SubTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedHours: number;
  actualHours?: number;
  dependencies: string[];
}

export interface Milestone {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  subTasks: SubTask[];
  estimatedHours: number;
  actualHours?: number;
  targetDate?: string;
}

export interface KanbanColumn {
  status: TaskStatus;
  label: string;
  milestones: MilestoneCardData[];
}

export interface MilestoneCardData {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  completedSubTasks: number;
  totalSubTasks: number;
  progressPct: number;
  estimatedHours: number;
  actualHours?: number;
}

// ── WeaveLink HTTP API ───────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  transport: string;
}

export interface ServerInfo {
  name: string;
  version: string;
  description: string;
}

export interface SessionListEntry {
  chatId: string;
  updatedAt: string;
  nodeCount: number;
}
