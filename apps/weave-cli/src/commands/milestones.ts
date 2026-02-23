import { existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand } from '../types';
import { resolveProjectRoot } from '../utils';

interface Milestone {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'deferred';
  priority: 'critical' | 'high' | 'medium' | 'low';
  start_date?: string;
  end_date?: string;
  completion_percentage: number;
  subtasks: {
    id: string;
    title: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'deferred';
    completed_date?: string;
  }[];
}

/**
 * Milestones Command - View project milestones and tasks
 */
export class MilestonesCommand implements CliCommand {
  name = 'milestones';
  description = 'List all milestones and sub-tasks';
  usage = 'weave milestones [--filter=active] [--sort=priority]';
  flags = {
    filter: {
      short: 'f',
      description:
        'Filter by status: all, active, completed, blocked (default: all)',
      default: 'all',
    },
    sort: {
      short: 's',
      description: 'Sort by: priority, date, name (default: priority)',
      default: 'priority',
    },
    json: {
      short: 'j',
      description: 'Output as JSON',
      default: false,
    },
  };

  async execute(args: CLIArgs): Promise<CommandResult> {
    try {
      const projectRoot = resolveProjectRoot();
      const weaveDir = join(projectRoot, '.weave');
      const roadmapPath = join(weaveDir, 'ROADMAP.md');

      if (!existsSync(roadmapPath)) {
        return {
          success: false,
          message: 'Error: ROADMAP.md not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      // Mock milestones for demonstration
      const mockMilestones: Milestone[] = [
        {
          id: 'm1',
          name: 'Setup Development Environment',
          status: 'completed',
          priority: 'critical',
          completion_percentage: 100,
          subtasks: [
            {
              id: 'st1',
              title: 'Install dependencies',
              status: 'completed',
              completed_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
            {
              id: 'st2',
              title: 'Configure TypeScript',
              status: 'completed',
              completed_date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
            {
              id: 'st3',
              title: 'Setup testing framework',
              status: 'completed',
              completed_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
          ],
        },
        {
          id: 'm2',
          name: 'Core Feature Implementation',
          status: 'in_progress',
          priority: 'critical',
          start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          completion_percentage: 65,
          subtasks: [
            {
              id: 'st4',
              title: 'Implement knowledge graph',
              status: 'completed',
              completed_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
            {
              id: 'st5',
              title: 'Add orphan detection',
              status: 'in_progress',
            },
            {
              id: 'st6',
              title: 'Implement milestone planner',
              status: 'not_started',
            },
            {
              id: 'st7',
              title: 'Create MCP server',
              status: 'not_started',
            },
          ],
        },
        {
          id: 'm3',
          name: 'CLI Development',
          status: 'not_started',
          priority: 'high',
          completion_percentage: 0,
          subtasks: [
            {
              id: 'st8',
              title: 'Design CLI commands',
              status: 'not_started',
            },
            {
              id: 'st9',
              title: 'Implement command handlers',
              status: 'not_started',
            },
            {
              id: 'st10',
              title: 'Add help and documentation',
              status: 'not_started',
            },
          ],
        },
      ];

      const filter = (args.flags.filter as string) || 'all';
      const filtered = this.filterMilestones(mockMilestones, filter);

      if (args.flags.json) {
        return {
          success: true,
          message: JSON.stringify(filtered, null, 2),
          data: filtered,
        };
      }

      let output = '\n📋 Project Milestones\n' + '='.repeat(60) + '\n';

      for (const milestone of filtered) {
        output += this.formatMilestone(milestone);
      }

      output += '\n' + '='.repeat(60) + '\n';
      output += `Total: ${filtered.length} milestone(s)\n`;

      return {
        success: true,
        message: output,
        data: filtered,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error reading milestones',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private filterMilestones(
    milestones: Milestone[],
    filter: string
  ): Milestone[] {
    if (filter === 'all') return milestones;
    if (filter === 'active')
      return milestones.filter((m) => m.status === 'in_progress');
    if (filter === 'completed')
      return milestones.filter((m) => m.status === 'completed');
    if (filter === 'blocked')
      return milestones.filter((m) => m.status === 'blocked');
    return milestones;
  }

  private formatMilestone(milestone: Milestone): string {
    const statusIcon = {
      completed: '✅',
      in_progress: '🔄',
      not_started: '🔜',
      blocked: '⛔',
      deferred: '⏸️',
    }[milestone.status];

    const priorityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    }[milestone.priority];

    let output = `\n${statusIcon} ${milestone.name} [${priorityEmoji} ${milestone.priority}]\n`;
    output += `   Progress: ${this.progressBar(milestone.completion_percentage)} ${milestone.completion_percentage}%\n`;

    if (milestone.subtasks && milestone.subtasks.length > 0) {
      output += '   Sub-tasks:\n';
      for (const subtask of milestone.subtasks) {
        const subIcon = {
          completed: '✓',
          in_progress: '→',
          not_started: '○',
          blocked: '✗',
          deferred: '–',
        }[subtask.status];
        output += `      [${subIcon}] ${subtask.title}\n`;
      }
    }

    return output;
  }

  private progressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}

export const milestonesCommand = new MilestonesCommand();
