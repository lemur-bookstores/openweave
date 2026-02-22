/**
 * Weave CLI Types
 */

export interface CLIArgs {
  command: string;
  subcommand?: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export interface CLIConfig {
  project_name: string;
  project_root: string;
  knowledge_graph_path: string;
  roadmap_file: string;
  include_tests: boolean;
  max_context_depth: number;
  verbose: boolean;
  debug: boolean;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export interface ProjectState {
  created_at: Date;
  last_updated: Date;
  session_id: string;
  milestones: number;
  total_nodes: number;
  total_edges: number;
  context_usage_percent: number;
}

export interface CliCommand {
  name: string;
  description: string;
  usage: string;
  flags?: Record<
    string,
    {
      short?: string;
      description: string;
      default?: string | boolean;
    }
  >;
  execute(args: CLIArgs): Promise<CommandResult>;
}
