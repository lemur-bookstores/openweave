import { RoadmapDocument, Status } from "./types";

/**
 * RoadmapGenerator — Converts milestone data into markdown documentation
 */
export class RoadmapGenerator {
  /**
   * Generate markdown roadmap from roadmap document
   */
  static generateMarkdown(doc: RoadmapDocument): string {
    const lines: string[] = [];

    // Header
    lines.push(`# 🗺️ ${doc.title}`);
    lines.push("");
    lines.push(`> Last updated: ${doc.lastUpdated.toISOString().split("T")[0]}`);
    lines.push("");
    lines.push(doc.overview);
    lines.push("");

    // Legend
    lines.push("## Legend");
    lines.push("- ✅ Completed");
    lines.push("- 🔄 In Progress");
    lines.push("- 🔜 Not Started");
    lines.push("- ⛔ Blocked");
    lines.push("- ⏸️ Deferred");
    lines.push("");

    // Statistics
    lines.push("## Progress");
    const completionPercentage = Math.round(
      (doc.stats.completedMilestones / doc.stats.totalMilestones) * 100
    );
    lines.push(`- Milestones: ${doc.stats.completedMilestones}/${doc.stats.totalMilestones} completed (${completionPercentage}%)`);
    lines.push(`- Hours: ${doc.stats.hoursElapsed}/${doc.stats.totalHours} (${Math.round((doc.stats.hoursElapsed / doc.stats.totalHours) * 100) || 0}%)`);
    lines.push("");

    // Phases and Milestones
    for (const phase of doc.phases) {
      lines.push(`## ${phase.phase}`);
      lines.push("");

      for (const milestone of phase.milestones) {
        const statusIcon = RoadmapGenerator.statusIcon(milestone.status);
        lines.push(`### ${statusIcon} ${milestone.id} · ${milestone.name}`);

        // Sub-tasks
        if (milestone.subTasks.length > 0) {
          const completedSubTasks = milestone.subTasks.filter(
            (st) => st.status === Status.COMPLETED
          ).length;
          const progress = Math.round(
            (completedSubTasks / milestone.subTasks.length) * 100
          );
          lines.push(`**Progress**: ${completedSubTasks}/${milestone.subTasks.length} (${progress}%)`);
          lines.push("");
          lines.push("**Sub-tasks**:");

          for (const subTask of milestone.subTasks) {
            const subStatusIcon = RoadmapGenerator.statusIcon(subTask.status);
            lines.push(`- ${subStatusIcon} ${subTask.title}`);
          }
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate a simple status badge for markdown
   */
  private static statusIcon(status: Status): string {
    switch (status) {
      case Status.COMPLETED:
        return "✅";
      case Status.IN_PROGRESS:
        return "🔄";
      case Status.NOT_STARTED:
        return "🔜";
      case Status.BLOCKED:
        return "⛔";
      case Status.DEFERRED:
        return "⏸️";
      default:
        return "❓";
    }
  }

  /**
   * Generate a simple ASCII progress bar
   */
  static generateProgressBar(
    completed: number,
    total: number,
    width: number = 20
  ): string {
    const percentage = total > 0 ? completed / total : 0;
    const filled = Math.round(percentage * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${Math.round(percentage * 100)}%`;
  }

  /**
   * Generate a summary table of all milestones
   */
  static generateSummaryTable(doc: RoadmapDocument): string {
    const lines: string[] = [];
    lines.push("## Milestone Summary");
    lines.push("");
    lines.push("| Milestone | Status | Completion | Est Hours | Act Hours |");
    lines.push("|-----------|--------|------------|-----------|-----------|");

    for (const phase of doc.phases) {
      for (const milestone of phase.milestones) {
        const completed = milestone.subTasks.filter(
          (st) => st.status === Status.COMPLETED
        ).length;
        const total = milestone.subTasks.length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        const statusIcon = RoadmapGenerator.statusIcon(milestone.status);
        lines.push(
          `| ${milestone.id} | ${statusIcon} | ${progress}% (${completed}/${total}) | - | - |`
        );
      }
    }

    return lines.join("\n");
  }
}
