import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand } from '../types';
import { resolveProjectRoot } from '../utils';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  metadata?: Record<string, unknown>;
  frequency?: number;
  created_at: string;
  updated_at: string;
}

/**
 * SaveNode Command - Manually add or update a node in the knowledge graph
 */
export class SaveNodeCommand implements CliCommand {
  name = 'save-node';
  description = 'Manually add or update a node in the knowledge graph';
  usage = 'weave save-node --label=<name> --type=<type> [--description=<desc>]';
  flags = {
    label: {
      short: 'l',
      description: 'Node label/name (required)',
    },
    type: {
      short: 't',
      description: 'Node type: function, class, variable, interface, enum, etc.',
    },
    description: {
      short: 'd',
      description: 'Node description/documentation',
      default: '',
    },
    file: {
      short: 'f',
      description: 'Source file location',
      default: '',
    },
    line: {
      description: 'Line number in source file',
      default: '0',
    },
    frequency: {
      description: 'Reference frequency hint',
      default: '1',
    },
    json: {
      short: 'j',
      description: 'Output as JSON',
      default: false,
    },
  };

  async execute(args: CLIArgs): Promise<CommandResult> {
    try {
      const label = args.flags.label as string;
      const type = args.flags.type as string;

      if (!label) {
        return {
          success: false,
          message: 'Error: --label is required',
          error: 'Usage: weave save-node --label=<name> --type=<type>',
        };
      }

      if (!type) {
        return {
          success: false,
          message: 'Error: --type is required',
          error:
            'Valid types: function, class, variable, interface, enum, module, type, method',
        };
      }

      const projectRoot = resolveProjectRoot(args.flags.root as string | undefined);
      const weaveDir = join(projectRoot, '.weave');
      const graphPath = join(weaveDir, 'graph.json');

      if (!existsSync(graphPath)) {
        return {
          success: false,
          message: 'Error: Knowledge graph not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      // Read existing graph
      const graphContent = readFileSync(graphPath, 'utf-8');
      const graphData = JSON.parse(graphContent);

      // Create new node
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const newNode: GraphNode = {
        id: nodeId,
        label,
        type: type.toUpperCase(),
        description: (args.flags.description as string) || undefined,
        frequency: parseInt((args.flags.frequency as string) || '1', 10),
        created_at: now,
        updated_at: now,
      };

      if (args.flags.file) {
        newNode.metadata = {
          file: args.flags.file,
          line: parseInt((args.flags.line as string) || '0', 10),
        };
      }

      // Add to graph
      graphData.nodes.push(newNode);

      // Write back
      writeFileSync(graphPath, JSON.stringify(graphData, null, 2));

      if (args.flags.json) {
        return {
          success: true,
          message: JSON.stringify(newNode, null, 2),
          data: newNode,
        };
      }

      const output = `
✅ Node created successfully!

📍 Node ID: ${newNode.id}
📌 Label: ${newNode.label}
🏷️  Type: ${newNode.type}
${newNode.description ? `📝 Description: ${newNode.description}\n` : ''}

Graph Statistics:
• Total nodes: ${graphData.nodes.length}
• Total edges: ${graphData.edges.length}

Use 'weave query ${newNode.label}' to search for this node.
`;

      return {
        success: true,
        message: output,
        data: newNode,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error saving node',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const saveNodeCommand = new SaveNodeCommand();
