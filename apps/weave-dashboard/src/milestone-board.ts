/**
 * MilestoneBoard — M10
 *
 * Pure data transformation layer: groups milestones by status into Kanban
 * columns and computes per-card metrics.
 *
 * No DOM or browser APIs — fully unit-testable in Node.
 */

import type {
  Milestone,
  TaskStatus,
  KanbanColumn,
  MilestoneCardData,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────

const COLUMN_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS:  'In Progress',
  COMPLETED:    'Completed',
  BLOCKED:      'Blocked',
  DEFERRED:     'Deferred',
};

const COLUMN_ORDER: TaskStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'DEFERRED',
];

// ──────────────────────────────────────────────────────────────────────────────

export class MilestoneBoard {
  /**
   * Transform a flat list of milestones into Kanban columns.
   */
  static toColumns(milestones: Milestone[]): KanbanColumn[] {
    const grouped = new Map<TaskStatus, MilestoneCardData[]>(
      COLUMN_ORDER.map(s => [s, []])
    );

    for (const m of milestones) {
      const col = grouped.get(m.status) ?? grouped.get('NOT_STARTED')!;
      col.push(MilestoneBoard.toCard(m));
    }

    return COLUMN_ORDER.map(status => ({
      status,
      label: COLUMN_LABELS[status],
      milestones: grouped.get(status) ?? [],
    }));
  }

  /**
   * Convert a Milestone to a lightweight card representation.
   */
  static toCard(m: Milestone): MilestoneCardData {
    const total = m.subTasks.length;
    const done  = m.subTasks.filter(st => st.status === 'COMPLETED').length;
    const pct   = total === 0 ? (m.status === 'COMPLETED' ? 100 : 0) : Math.round((done / total) * 100);

    return {
      id:                m.id,
      name:              m.name,
      status:            m.status,
      priority:          m.priority,
      completedSubTasks: done,
      totalSubTasks:     total,
      progressPct:       pct,
      estimatedHours:    m.estimatedHours,
      actualHours:       m.actualHours,
    };
  }

  /**
   * Aggregate stats across all milestones.
   */
  static stats(milestones: Milestone[]): {
    total: number;
    byStatus: Record<TaskStatus, number>;
    overallProgress: number;
    totalEstimatedHours: number;
    totalActualHours: number;
  } {
    const byStatus: Record<TaskStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS:  0,
      COMPLETED:    0,
      BLOCKED:      0,
      DEFERRED:     0,
    };

    for (const m of milestones) {
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    }

    const active = milestones.filter(m => m.status !== 'DEFERRED' && m.status !== 'BLOCKED');
    const overallProgress =
      active.length === 0
        ? 100
        : Math.round((byStatus.COMPLETED / active.length) * 100);

    const totalEstimatedHours = milestones.reduce((s, m) => s + m.estimatedHours, 0);
    const totalActualHours = milestones.reduce((s, m) => s + (m.actualHours ?? 0), 0);

    return {
      total: milestones.length,
      byStatus,
      overallProgress,
      totalEstimatedHours,
      totalActualHours,
    };
  }

  /**
   * Sort milestones within a column by priority then name.
   */
  static sortByPriority(milestones: MilestoneCardData[]): MilestoneCardData[] {
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...milestones].sort((a, b) => {
      const pa = order[a.priority] ?? 99;
      const pb = order[b.priority] ?? 99;
      return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
    });
  }
}
