import {
  Epic,
  Milestone,
  SubTask,
  Status,
  ProgressMetrics,
  NextAction,
  RoadmapDocument,
  WeavePathConfig,
  MilestoneSession,
} from "./types";

/**
 * WeavePath — Core milestone and sub-task planning engine
 * Manages hierarchical goal decomposition and progress tracking
 */
export class WeavePath {
  private epic: Epic;
  private milestoneMap: Map<string, Milestone> = new Map();
  private session?: MilestoneSession;

  constructor(config: WeavePathConfig) {
    this.epic = {
      id: `epic-${Date.now()}`,
      name: "OpenWeave Development",
      description: config.goal,
      goal: config.goal,
      phases: [],
      startDate: config.startDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Add a milestone to the epic
   */
  addMilestone(milestone: Omit<Milestone, "status" | "actualHours">): void {
    const fullMilestone: Milestone = {
      ...milestone,
      status: Status.NOT_STARTED,
      actualHours: 0,
    };
    this.milestoneMap.set(milestone.id, fullMilestone);
  }

  /**
   * Get a milestone by ID
   */
  getMilestone(id: string): Milestone | undefined {
    return this.milestoneMap.get(id);
  }

  /**
   * Update a milestone's status
   */
  updateMilestoneStatus(id: string, status: Status): void {
    const milestone = this.milestoneMap.get(id);
    if (milestone) {
      milestone.status = status;
      if (status === Status.COMPLETED) {
        milestone.completionDate = new Date();
      }
      this.epic.updatedAt = new Date();
    }
  }

  /**
   * Add a sub-task to a milestone
   */
  addSubTask(milestoneId: string, subTask: Omit<SubTask, "status">): void {
    const milestone = this.milestoneMap.get(milestoneId);
    if (milestone) {
      const fullSubTask: SubTask = {
        ...subTask,
        status: Status.NOT_STARTED,
      };
      milestone.subTasks.push(fullSubTask);
      this.epic.updatedAt = new Date();
    }
  }

  /**
   * Update a sub-task's status
   */
  updateSubTaskStatus(milestoneId: string, subTaskId: string, status: Status): void {
    const milestone = this.milestoneMap.get(milestoneId);
    if (milestone) {
      const subTask = milestone.subTasks.find((st) => st.id === subTaskId);
      if (subTask) {
        subTask.status = status;
        if (status === Status.COMPLETED) {
          subTask.completionDate = new Date();
        }
        this.updateMilestoneStatusIfNeeded(milestoneId);
        this.epic.updatedAt = new Date();
      }
    }
  }

  /**
   * Update a milestone's actual hours spent
   */
  updateMilestoneHours(milestoneId: string, actualHours: number): void {
    const milestone = this.milestoneMap.get(milestoneId);
    if (milestone) {
      milestone.actualHours = (milestone.actualHours || 0) + actualHours;
      this.epic.updatedAt = new Date();
    }
  }

  /**
   * Calculate progress metrics for a milestone
   */
  getProgressMetrics(milestoneId: string): ProgressMetrics | null {
    const milestone = this.milestoneMap.get(milestoneId);
    if (!milestone) return null;

    const totalSubTasks = milestone.subTasks.length;
    const completedSubTasks = milestone.subTasks.filter(
      (st) => st.status === Status.COMPLETED
    ).length;
    const inProgressSubTasks = milestone.subTasks.filter(
      (st) => st.status === Status.IN_PROGRESS
    ).length;
    const blockedSubTasks = milestone.subTasks.filter((st) => st.status === Status.BLOCKED)
      .length;

    const completionPercentage =
      totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

    const estimatedTotalHours = milestone.estimatedHours;
    const actualTotalHours = milestone.actualHours || 0;

    // Simple projection: if we've completed X%, estimate total time
    const projectedCompletionDate =
      completionPercentage > 0 && actualTotalHours > 0
        ? new Date(
            Date.now() + (actualTotalHours / completionPercentage) * (100 - completionPercentage) * 60 * 60 * 1000
          )
        : milestone.targetDate;

    const daysElapsed = milestone.startDate
      ? Math.floor((Date.now() - milestone.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      totalSubTasks,
      completedSubTasks,
      inProgressSubTasks,
      blockedSubTasks,
      completionPercentage,
      estimatedTotalHours,
      actualTotalHours,
      daysElapsed,
      projectedCompletionDate,
    };
  }

  /**
   * Get the next recommended action
   */
  getNextAction(): NextAction | null {
    // Find incomplete milestones in order
    const incompleteMilestones = Array.from(this.milestoneMap.values()).filter(
      (m) => m.status !== Status.COMPLETED && m.status !== Status.DEFERRED
    );

    for (const milestone of incompleteMilestones) {
      // Check if dependencies are met
      const depsBlocking = milestone.dependencies.some(
        (depId) => this.milestoneMap.get(depId)?.status !== Status.COMPLETED
      );
      if (depsBlocking) continue;

      // Find next incomplete sub-task
      for (const subTask of milestone.subTasks) {
        if (subTask.status === Status.COMPLETED) continue;

        // Check sub-task dependencies
        const subDepsBlocking = subTask.dependencies.some((depId) => {
          const [depMilestoneId] = depId.split("-");
          const depMilestone = this.milestoneMap.get(depMilestoneId);
          const depSubTask = depMilestone?.subTasks.find((st) => st.id === depId);
          return depSubTask?.status !== Status.COMPLETED;
        });

        if (subDepsBlocking) continue;

        // This is the next action
        return {
          subTaskId: subTask.id,
          milestoneId: milestone.id,
          title: subTask.title,
          description: subTask.description,
          estimatedHours: subTask.estimatedHours,
          priority: subTask.priority,
          reason:
            subTask.status === Status.NOT_STARTED
              ? "Ready to start - no blocking dependencies"
              : "Currently in progress",
          blockers: subDepsBlocking ? subTask.dependencies : undefined,
        };
      }
    }

    return null;
  }

  /**
   * Get overall epic progress
   */
  getEpicProgress(): ProgressMetrics {
    const milestones = Array.from(this.milestoneMap.values());
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) => m.status === Status.COMPLETED).length;

    let totalSubTasks = 0;
    let completedSubTasks = 0;
    let estimatedHours = 0;
    let actualHours = 0;

    for (const milestone of milestones) {
      totalSubTasks += milestone.subTasks.length;
      completedSubTasks += milestone.subTasks.filter((st) => st.status === Status.COMPLETED)
        .length;
      estimatedHours += milestone.estimatedHours;
      actualHours += milestone.actualHours || 0;
    }

    const completionPercentage =
      totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

    return {
      totalSubTasks,
      completedSubTasks,
      inProgressSubTasks: totalSubTasks - completedSubTasks - (totalMilestones - completedMilestones) * 5, // Rough estimate
      blockedSubTasks: 0,
      completionPercentage,
      estimatedTotalHours: estimatedHours,
      actualTotalHours: actualHours,
      daysElapsed: Math.floor((Date.now() - this.epic.startDate.getTime()) / (1000 * 60 * 60 * 24)),
    };
  }

  /**
   * Generate roadmap markdown document
   */
  generateRoadmap(): RoadmapDocument {
    const milestones = Array.from(this.milestoneMap.values());
    const completedMilestones = milestones.filter((m) => m.status === Status.COMPLETED).length;

    const phases = this.epic.phases.map((phase) => ({
      phase: phase.name,
      milestones: phase.milestones
        .map((mid) => this.milestoneMap.get(mid))
        .filter((m) => m !== undefined)
        .map((m) => ({
          id: m!.id,
          name: m!.name,
          status: m!.status,
          subTasks: m!.subTasks.map((st) => ({
            id: st.id,
            title: st.title,
            status: st.status,
          })),
        })),
    }));

    const epicProgress = this.getEpicProgress();

    return {
      title: this.epic.name,
      lastUpdated: new Date(),
      overview: this.epic.goal,
      phases,
      stats: {
        totalMilestones: milestones.length,
        completedMilestones,
        totalHours: epicProgress.estimatedTotalHours,
        hoursElapsed: epicProgress.actualTotalHours,
      },
    };
  }

  /**
   * Load a milestone session (for persistence)
   */
  loadSession(session: MilestoneSession): void {
    this.session = session;
    // Restore milestone states from session
    for (const [milestoneId, state] of Object.entries(session.milestoneStates)) {
      const milestone = this.milestoneMap.get(milestoneId);
      if (milestone) {
        milestone.status = state.status;
        milestone.actualHours = state.actualHours;
      }
    }
  }

  /**
   * Save current state to session
   */
  saveSession(sessionId: string): MilestoneSession {
    const session: MilestoneSession = {
      id: sessionId,
      epicId: this.epic.id,
      createdAt: this.session?.createdAt || new Date(),
      updatedAt: new Date(),
      completedMilestones: Array.from(this.milestoneMap.entries())
        .filter(([_, m]) => m.status === Status.COMPLETED)
        .map(([id]) => id),
      milestoneStates: Object.fromEntries(
        Array.from(this.milestoneMap.entries()).map(([id, milestone]) => [
          id,
          {
            status: milestone.status,
            actualHours: milestone.actualHours || 0,
            notes: milestone.description,
          },
        ])
      ),
    };
    this.session = session;
    return session;
  }

  /**
   * Private helper: update milestone status based on sub-task completion
   */
  private updateMilestoneStatusIfNeeded(milestoneId: string): void {
    const milestone = this.milestoneMap.get(milestoneId);
    if (!milestone) return;

    const allCompleted = milestone.subTasks.every((st) => st.status === Status.COMPLETED);
    const anyInProgress = milestone.subTasks.some((st) => st.status === Status.IN_PROGRESS);
    const anyBlocked = milestone.subTasks.some((st) => st.status === Status.BLOCKED);

    if (allCompleted && milestone.status !== Status.COMPLETED) {
      milestone.status = Status.COMPLETED;
      milestone.completionDate = new Date();
    } else if (anyInProgress && milestone.status === Status.NOT_STARTED) {
      milestone.status = Status.IN_PROGRESS;
    } else if (anyBlocked && milestone.status === Status.NOT_STARTED) {
      milestone.status = Status.BLOCKED;
    }
  }
}
