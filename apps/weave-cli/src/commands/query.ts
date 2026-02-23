import { existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand } from '../types';
import { resolveProjectRoot } from '../utils';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  frequency: number;
  last_accessed?: string;
}

/**
 * Query Command - Search the knowledge graph
 */
export class QueryCommand implements CliCommand {
  name = 'query';
  description = 'Search the knowledge graph for nodes and relationships';
  usage = 'weave query <search-term> [--limit=10] [--type=all]';
  flags = {
    limit: {
      short: 'l',
      description: 'Maximum results to return (default: 10)',
      default: '10',
    },
    type: {
      short: 't',
      description: 'Filter by node type (default: all)',
      default: 'all',
    },
    json: {
      short: 'j',
      description: 'Output as JSON',
      default: false,
    },
  };

  async execute(args: CLIArgs): Promise<CommandResult> {
    try {
      const searchTerm = args.args[0];
      if (!searchTerm) {
        return {
          success: false,
          message: 'Error: Search term is required',
          error: 'Usage: weave query <search-term>',
        };
      }

      const projectRoot = resolveProjectRoot();
      const weaveDir = join(projectRoot, '.weave');
      const graphPath = join(weaveDir, 'graph.json');

      if (!existsSync(graphPath)) {
        return {
          success: false,
          message: 'Error: Knowledge graph not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      // Mock search results for demonstration
      const mockResults: GraphNode[] = [
        {
          id: 'n1',
          label: 'initializeProject',
          type: 'FUNCTION',
          description: 'Initializes a new project with default settings',
          frequency: 5,
          last_accessed: new Date().toISOString().split('T')[0],
        },
        {
          id: 'n2',
          label: 'ProjectManager',
          type: 'CLASS',
          description: 'Manages project lifecycle and state',
          frequency: 12,
          last_accessed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        },
        {
          id: 'n3',
          label: 'project_config',
          type: 'VARIABLE',
          description: 'Global configuration object',
          frequency: 3,
          last_accessed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        },
      ];

      const limit = parseInt((args.flags.limit as string) || '10', 10);
      const typeFilter = (args.flags.type as string) || 'all';

      let results = mockResults.filter((r) =>
        r.label.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (typeFilter !== 'all') {
        results = results.filter((r) => r.type === typeFilter.toUpperCase());
      }

      results = results.slice(0, limit);

      if (args.flags.json) {
        return {
          success: true,
          message: JSON.stringify(results, null, 2),
          data: results,
        };
      }

      let output = `\n🔍 Query Results for: "${searchTerm}"\n`;
      output += '='.repeat(60) + '\n';

      if (results.length === 0) {
        output += 'No results found.\n';
      } else {
        for (const node of results) {
          output += this.formatNode(node);
        }
      }

      output += '\n' + '='.repeat(60) + '\n';
      output += `Found: ${results.length} result(s)\n`;

      return {
        success: true,
        message: output,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error querying knowledge graph',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private formatNode(node: GraphNode): string {
    const typeEmoji = {
      FUNCTION: '📌',
      CLASS: '🏛️',
      INTERFACE: '📋',
      ENUM: '📊',
      TYPE: '📝',
      VARIABLE: '📦',
      METHOD: '🔧',
      MODULE: '📚',
    }[node.type] || '❓';

    let output = `\n${typeEmoji} ${node.label} (${node.type})\n`;
    if (node.description) {
      output += `   Description: ${node.description}\n`;
    }
    output += `   ID: ${node.id}\n`;
    output += `   Frequency: ${node.frequency} times\n`;
    if (node.last_accessed) {
      output += `   Last accessed: ${node.last_accessed}\n`;
    }

    return output;
  }
}

export const queryCommand = new QueryCommand();
