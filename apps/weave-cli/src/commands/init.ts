import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand, CLIConfig } from '../types';
import { resolveProjectRoot } from '../utils';

/**
 * Init Command - Initialize a new Weave project
 */
export class InitCommand implements CliCommand {
  name = 'init';
  description = 'Initialize a new Weave project';
  usage = 'weave init <project-name> [--root /path] [--include-tests]';
  flags = {
    root: {
      short: 'r',
      description: 'Project root directory',
      default: '',
    },
    'include-tests': {
      short: 't',
      description: 'Include test files in analysis',
      default: false,
    },
    verbose: {
      short: 'v',
      description: 'Verbose output',
      default: false,
    },
  };

  async execute(args: CLIArgs): Promise<CommandResult> {
    try {
      const projectName = args.args[0];
      if (!projectName) {
        return {
          success: false,
          message: 'Error: Project name is required',
          error: 'Usage: weave init <project-name>',
        };
      }

      const projectRoot = resolveProjectRoot(args.flags.root as string | undefined);
      const weaveDir = join(projectRoot, '.weave');
      const graphDbPath = join(weaveDir, 'graph.json');
      const roadmapPath = join(weaveDir, 'ROADMAP.md');
      const configPath = join(weaveDir, 'config.json');

      // Check if .weave directory already exists
      if (existsSync(weaveDir)) {
        return {
          success: false,
          message: `Error: .weave directory already exists in ${projectRoot}`,
          error: 'Project may already be initialized',
        };
      }

      // Create .weave directory structure
      mkdirSync(weaveDir, { recursive: true });

      // Create config file
      const config: CLIConfig = {
        project_name: projectName,
        project_root: projectRoot,
        knowledge_graph_path: graphDbPath,
        roadmap_file: roadmapPath,
        include_tests: (args.flags['include-tests'] as boolean) || false,
        max_context_depth: 5,
        verbose: (args.flags.verbose as boolean) || false,
        debug: false,
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Create empty graph database
      const emptyGraph = {
        created_at: new Date().toISOString(),
        nodes: [],
        edges: [],
        sessions: {},
      };
      writeFileSync(graphDbPath, JSON.stringify(emptyGraph, null, 2));

      // Create roadmap file
      const roadmapContent = `# ${projectName} - Development Roadmap

## Project Overview
This roadmap tracks the development progress of ${projectName}.

**Initialized:** ${new Date().toLocaleDateString()}

## Milestones

### Phase 0: Planning
- [ ] Define project architecture
- [ ] Set up development environment
- [ ] Configure knowledge graph

`;
      writeFileSync(roadmapPath, roadmapContent);

      const successMessage = `✅ Project "${projectName}" initialized successfully!

📁 Created .weave directory in: ${projectRoot}
📊 Knowledge graph created: ${graphDbPath}
📋 Roadmap created: ${roadmapPath}
⚙️  Config saved: ${configPath}

Next steps:
• Run 'weave status' to see project overview
• Run 'weave orphans' to analyze code for unused exports
• Run 'weave query <term>' to search the knowledge graph
`;

      return {
        success: true,
        message: successMessage,
        data: {
          project_name: projectName,
          project_root: projectRoot,
          weave_directory: weaveDir,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error initializing project',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const initCommand = new InitCommand();
