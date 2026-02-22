/**
 * WeavePath — Milestone & Sub-task Planner
 * Structures goals into hierarchical milestones and actionable sub-tasks
 */

/**
 * Status of a milestone or sub-task
 */
export enum Status {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  BLOCKED = "BLOCKED",
  DEFERRED = "DEFERRED",
}

/**
 * Priority level for task prioritization
 */
export enum Priority {
  CRITICAL = "CRITICAL", // Blocking other work
  HIGH = "HIGH", // Important milestone
  MEDIUM = "MEDIUM", // Standard work
  LOW = "LOW", // Optional, nice-to-have
}

/**
 * A single actionable sub-task within a milestone
 */
export interface SubTask {
  id: string; // e.g., "M1-1", "M1-2"
  title: string; // e.g., "Implement node data model"
  description: string;
  status: Status;
  priority: Priority;
  estimatedHours: number;
  actualHours?: number;
  dependencies: string[]; // IDs of other sub-tasks this depends on
  completionDate?: Date;
  notes?: string;
  assignee?: string;
}

/**
 * A milestone containing multiple sub-tasks
 */
export interface Milestone {
  id: string; // e.g., "M1", "M2"
  name: string; // e.g., "WeaveGraph Core"
  description: string;
  status: Status;
  priority: Priority;
  estimatedHours: number;
  actualHours?: number;
  subTasks: SubTask[];
  dependencies: string[]; // IDs of other milestones this depends on
  startDate?: Date;
  targetDate?: Date;
  completionDate?: Date;
  successCriteria: string[]; // Acceptance criteria
}

/**
 * A phase grouping related milestones
 */
export interface Phase {
  id: string; // e.g., "PHASE_1_FOUNDATION"
  name: string; // e.g., "Foundation v0.1.0"
  description: string;
  milestones: string[]; // IDs of milestones in this phase
  estimatedHours: number;
  targetVersion: string; // e.g., "v0.1.0"
}

/**
 * Top-level epic containing all phases and milestones
 */
export interface Epic {
  id: string;
  name: string;
  description: string;
  goal: string; // High-level objective
  phases: Phase[];
  startDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Progress metrics for a milestone or epic
 */
export interface ProgressMetrics {
  totalSubTasks: number;
  completedSubTasks: number;
  inProgressSubTasks: number;
  blockedSubTasks: number;
  completionPercentage: number; // 0-100
  estimatedTotalHours: number;
  actualTotalHours: number;
  daysElapsed: number;
  projectedCompletionDate?: Date;
}

/**
 * Next actionable step recommended by the planner
 */
export interface NextAction {
  subTaskId: string;
  milestoneId: string;
  title: string;
  description: string;
  reason: string; // Why this action is recommended
  estimatedHours: number;
  priority: Priority;
  blockers?: string[]; // Dependencies not yet completed
}

/**
 * Roadmap document structure for markdown generation
 */
export interface RoadmapDocument {
  title: string;
  lastUpdated: Date;
  overview: string;
  phases: {
    phase: string;
    milestones: {
      id: string;
      name: string;
      status: Status;
      subTasks: {
        id: string;
        title: string;
        status: Status;
      }[];
    }[];
  }[];
  stats: {
    totalMilestones: number;
    completedMilestones: number;
    totalHours: number;
    hoursElapsed: number;
  };
}

/**
 * Configuration for WeavePath planner
 */
export interface WeavePathConfig {
  goal: string;
  phaseCount?: number;
  estimatedTotalHours?: number;
  startDate?: Date;
}

/**
 * Session state for persisting milestone progress
 */
export interface MilestoneSession {
  id: string; // chat_id
  epicId: string;
  createdAt: Date;
  updatedAt: Date;
  currentMilestoneId?: string;
  completedMilestones: string[];
  milestoneStates: Record<
    string,
    {
      status: Status;
      actualHours: number;
      notes: string;
    }
  >;
}
