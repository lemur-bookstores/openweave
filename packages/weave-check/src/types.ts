/**
 * WeaveCheck — Shared Type Definitions
 *
 * All input data types are self-contained mirrors of the key shapes
 * from other OpenWeave packages, so weave-check has zero runtime
 * dependencies and tests stay fast.
 */

// ──────────────────────────────────────────────────────────
// Shared KPI result shape
// ──────────────────────────────────────────────────────────

export type KPIStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

export interface KPIResult {
  /** Machine-readable KPI identifier */
  id: string;
  /** Human-readable name */
  name: string;
  status: KPIStatus;
  /** Numeric score for this KPI (0–100, higher = better) */
  score: number;
  /** Lower bound for PASS. score >= passThreshold → PASS */
  passThreshold: number;
  /** Lower bound for WARN. score >= warnThreshold but < passThreshold → WARN */
  warnThreshold: number;
  /** Human-readable summary */
  summary: string;
  /** Supporting details or evidence */
  details: string[];
  /** Computed at ISO timestamp */
  evaluatedAt: string;
}

// ──────────────────────────────────────────────────────────
// Orphan Rate KPI — input types (mirrors WeaveLint)
// ──────────────────────────────────────────────────────────

export type LintSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface OrphanEntry {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  severity: LintSeverity;
  isExported: boolean;
}

export interface LintReport {
  /** All entities discovered in the codebase */
  totalEntities: number;
  /** Entities with no usages found */
  orphans: OrphanEntry[];
  /** Files that were analyzed */
  analyzedFiles: string[];
  /** Timestamp of the analysis */
  analyzedAt: string;
}

// ──────────────────────────────────────────────────────────
// Graph Coherence KPI — input types (mirrors WeaveGraph)
// ──────────────────────────────────────────────────────────

export type GraphNodeType = 'CONCEPT' | 'DECISION' | 'MILESTONE' | 'ERROR' | 'CORRECTION' | 'CODE_ENTITY';
export type GraphEdgeType = 'RELATES' | 'CAUSES' | 'CORRECTS' | 'IMPLEMENTS' | 'DEPENDS_ON' | 'BLOCKS';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description?: string;
  frequency?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: GraphEdgeType;
  weight?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GraphSnapshot {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  metadata: {
    chatId: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    compressionThreshold: number;
  };
}

// ──────────────────────────────────────────────────────────
// Error Repetition KPI — input types
// ──────────────────────────────────────────────────────────

export interface SessionSnapshot {
  sessionId: string;
  snapshot: GraphSnapshot;
  capturedAt: string;
}

// ──────────────────────────────────────────────────────────
// Milestone Adherence KPI — input types (mirrors WeavePath)
// ──────────────────────────────────────────────────────────

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
  completionDate?: string;
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
  completionDate?: string;
}

// ──────────────────────────────────────────────────────────
// Compression Quality KPI — input types
// ──────────────────────────────────────────────────────────

export interface CompressionSnapshot {
  /** Graph state immediately before compression */
  before: GraphSnapshot;
  /** Graph state immediately after compression */
  after: GraphSnapshot;
  /** Declared compression threshold (0–1) */
  compressionThreshold: number;
}

// ──────────────────────────────────────────────────────────
// Eval Report (runner output)
// ──────────────────────────────────────────────────────────

export interface EvalReport {
  /** Unique run identifier */
  runId: string;
  /** ISO timestamp of when the report was generated */
  generatedAt: string;
  /** Optional tag to distinguish report sets (e.g., commit SHA) */
  tag?: string;
  /** Per-KPI results */
  results: KPIResult[];
  /** Aggregate percentage score across all non-SKIP KPIs */
  overallScore: number;
  /** PASS / WARN / FAIL based on overallScore thresholds */
  overallStatus: KPIStatus;
  /** Human-readable summary */
  summary: string;
}

export interface WeaveCheckConfig {
  /** Thresholds for overall score interpretation */
  passTreshold?: number;   // default 80
  warnThreshold?: number;  // default 60
  /** Tag to embed in reports */
  tag?: string;
  /** Disable specific evaluators by ID */
  skip?: string[];
}
