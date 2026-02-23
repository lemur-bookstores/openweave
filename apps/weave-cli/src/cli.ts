#!/usr/bin/env node

import { CLIArgs, CommandResult, CliCommand } from './types';
import { initCommand } from './commands/init';
import { statusCommand } from './commands/status';
import { milestonesCommand } from './commands/milestones';
import { queryCommand } from './commands/query';
import { orphansCommand } from './commands/orphans';
import { errorsCommand } from './commands/errors';
import { saveNodeCommand } from './commands/save-node';
import { migrateCommand } from './commands/migrate';
import { skillsCommand } from './commands/skills';
import { toolsCommand } from './commands/tools';

/**
 * Weave CLI - Main Entry Point
 */

const commands: Record<string, CliCommand> = {
  init: initCommand,
  status: statusCommand,
  milestones: milestonesCommand,
  query: queryCommand,
  orphans: orphansCommand,
  errors: errorsCommand,
  'save-node': saveNodeCommand,
  migrate: migrateCommand,
  skills: skillsCommand,
  tools: toolsCommand,
};

function parseArgs(): CLIArgs {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = argv[0];
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const parts = arg.substring(2).split('=');
      const flagName = parts[0];
      const flagValue = parts[1] !== undefined ? parts[1] : true;
      flags[flagName] = flagValue;
    } else if (arg.startsWith('-') && arg.length === 2) {
      const flagName = arg.substring(1);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        flags[flagName] = nextArg;
        i++;
      } else {
        flags[flagName] = true;
      }
    } else {
      args.push(arg);
    }
  }

  return { command, args, flags };
}

function showHelp(): void {
  console.log(`
🧵 Weave CLI - AI Agent Knowledge Management

Usage: weave <command> [options]

Commands:
  init <project>        Initialize a new Weave project
  status                Show current project status
  milestones            List all milestones and tasks
  query <term>          Search the knowledge graph
  orphans               Analyze code for unused exports
  errors                Show error registry
  save-node             Manually add a node to the graph
  skills                Manage skill modules (list, enable, disable, info)
  tools                 Manage external tool adapters (add, remove, list, info, test)
  migrate               Migrate data between storage providers

Global Options:
  --help, -h            Show this help message
  --version, -v         Show version number
  --verbose             Enable verbose output
  --json                Output as JSON

Examples:
  weave init my-project
  weave status --verbose
  weave query "authentication"
  weave orphans --severity=critical
  weave save-node --label=MyClass --type=class

For command-specific help:
  weave <command> --help

Documentation: https://github.com/openweave/openweave
`);
}

function showVersion(): void {
  console.log('Weave CLI v1.0.0');
}

async function main(): Promise<void> {
  try {
    const parsedArgs = parseArgs();

    // Handle global flags
    if (parsedArgs.flags.help || parsedArgs.flags.h) {
      showHelp();
      process.exit(0);
    }

    if (parsedArgs.flags.version || parsedArgs.flags.v) {
      showVersion();
      process.exit(0);
    }

    const command = commands[parsedArgs.command];

    if (!command) {
      console.error(
        `❌ Unknown command: ${parsedArgs.command}\n`
      );
      console.log('Run "weave --help" for usage information.');
      process.exit(1);
    }

    const result: CommandResult = await command.execute(parsedArgs);

    console.log(result.message);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error(
      '❌ CLI Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
