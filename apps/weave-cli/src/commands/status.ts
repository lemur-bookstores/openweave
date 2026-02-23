import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand, CLIConfig, ProjectState } from '../types';
import { resolveProjectRoot } from '../utils';

/**
 * Status Command - Display project status
 */
export class StatusCommand implements CliCommand {
  name = 'status';
  description = 'Show current project status and progress';
  usage = 'weave status [--verbose]';
  flags = {
    verbose: {
      short: 'v',
      description: 'Show detailed information',
      default: false,
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
      const configPath = join(weaveDir, 'config.json');

      if (!existsSync(configPath)) {
        return {
          success: false,
          message: 'Error: .weave directory not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      const configContent = readFileSync(configPath, 'utf-8');
      const config: CLIConfig = JSON.parse(configContent);

      const graphPath = join(weaveDir, 'graph.json');
      let graphData = { nodes: [], edges: [], sessions: {} };

      if (existsSync(graphPath)) {
        const graphContent = readFileSync(graphPath, 'utf-8');
        graphData = JSON.parse(graphContent);
      }

      const projectState: ProjectState = {
        created_at: new Date(),
        last_updated: new Date(),
        session_id: `session_${Date.now()}`,
        milestones: 0,
        total_nodes: graphData.nodes.length,
        total_edges: graphData.edges.length,
        context_usage_percent: Math.min(
          100,
          ((graphData.nodes.length + graphData.edges.length) / 10000) * 100
        ),
      };

      const outputJson = args.flags.json as boolean;

      if (outputJson) {
        return {
          success: true,
          message: JSON.stringify(projectState, null, 2),
          data: projectState,
        };
      }

      const verbose = args.flags.verbose as boolean;

      const statusMessage = `
📊 Project Status: ${config.project_name}
${'-'.repeat(50)}

📁 Location: ${config.project_root}
🕒 Session: ${projectState.session_id}

📈 Graph Statistics:
   • Nodes: ${projectState.total_nodes}
   • Edges: ${projectState.total_edges}
   • Context Usage: ${projectState.context_usage_percent.toFixed(1)}%

${verbose ? this.getVerboseInfo(config) : ''}

✨ Quick Commands:
   • weave query <term>     - Search the knowledge graph
   • weave orphans          - Analyze code for unused exports
   • weave milestones       - View milestone progress
   • weave errors           - Show error registry
`;

      return {
        success: true,
        message: statusMessage,
        data: projectState,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error reading project status',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getVerboseInfo(config: CLIConfig): string {
    return `
⚙️  Configuration:
   • Include Tests: ${config.include_tests}
   • Max Context Depth: ${config.max_context_depth}
   • Verbose Mode: ${config.verbose}
   • Debug Mode: ${config.debug}
`;
  }
}

export const statusCommand = new StatusCommand();
