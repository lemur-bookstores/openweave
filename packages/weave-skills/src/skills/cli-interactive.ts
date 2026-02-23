/**
 * Skill: cli-interactive
 *
 * REPL mode descriptor and command dispatcher for `weave chat`.
 * Opens a persistent conversational session with history, command autocompletion
 * and access to all active skills.
 *
 * In practice, the actual REPL loop is handled by the CLI process; this skill
 * provides the session configuration, help text and simulated command dispatch
 * for testing purposes.
 *
 * Input (via SkillContext.graph):
 *   - `ctx.graph['command']`   — string to simulate a REPL command (for tests)
 *   - `ctx.graph['history']`   — string[] of previous commands (injectable)
 *   - `ctx.graph['skills']`    — string[] of active skill IDs for help text
 *   - `ctx.graph['sessionId']` — override session ID
 *
 * Output data:
 *   - CliInteractiveResult
 */

import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
}

export interface ReplConfig {
  sessionId: string;
  prompt: string;
  historyFile: string;
  maxHistory: number;
  activeSkills: string[];
  commands: ReplCommand[];
}

export interface ReplCommandResult {
  command: string;
  args: string[];
  output: string;
  type: 'info' | 'success' | 'error' | 'skill';
}

export interface CliInteractiveResult {
  config: ReplConfig;
  commandResult?: ReplCommandResult;
  helpText: string;
  welcomeMessage: string;
}

// ---------------------------------------------------------------------------
// Built-in REPL commands
// ---------------------------------------------------------------------------

export const REPL_COMMANDS: ReplCommand[] = [
  {
    name: 'help',
    aliases: ['?', 'h'],
    description: 'Show available commands and active skills',
    usage: 'help [command]',
  },
  {
    name: 'skills',
    aliases: ['ls'],
    description: 'List all active skills',
    usage: 'skills',
  },
  {
    name: 'run',
    aliases: ['exec'],
    description: 'Execute a skill by ID',
    usage: 'run <skill-id> [--option value]',
  },
  {
    name: 'history',
    aliases: ['hist'],
    description: 'Show command history',
    usage: 'history [n]',
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear the terminal screen',
    usage: 'clear',
  },
  {
    name: 'session',
    aliases: ['info'],
    description: 'Show current session information',
    usage: 'session',
  },
  {
    name: 'quit',
    aliases: ['exit', 'q'],
    description: 'Exit the interactive session',
    usage: 'quit',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildHelpText(commands: ReplCommand[], activeSkills: string[]): string {
  const lines = [
    '╔═══════════════════════════════════════╗',
    '║      OpenWeave Interactive (REPL)     ║',
    '╚═══════════════════════════════════════╝',
    '',
    'Commands:',
    ...commands.map((c) => `  ${c.name.padEnd(12)} ${c.description}`),
    '',
    `Active skills (${activeSkills.length}):`,
    ...(activeSkills.length > 0
      ? activeSkills.map((s) => `  • ${s}`)
      : ['  No skills active — run `weave skills enable <id>`']),
    '',
    'Type `help <command>` for detailed usage.',
    'Type `quit` or press Ctrl+C to exit.',
  ];
  return lines.join('\n');
}

export function buildWelcomeMessage(sessionId: string): string {
  return [
    `🧠 OpenWeave v0.9.0 — Interactive Mode`,
    `Session: ${sessionId}`,
    `Type 'help' for commands, 'quit' to exit.`,
  ].join('\n');
}

export function parseCommand(input: string): { name: string; args: string[] } {
  const parts = input.trim().split(/\s+/);
  return { name: parts[0]?.toLowerCase() ?? '', args: parts.slice(1) };
}

export function dispatchCommand(
  parsed: { name: string; args: string[] },
  config: ReplConfig,
  history: string[],
): ReplCommandResult {
  const { name, args } = parsed;

  // Resolve aliases
  const cmd = config.commands.find(
    (c) => c.name === name || c.aliases.includes(name),
  );

  if (!cmd) {
    return {
      command: name,
      args,
      output: `Unknown command: "${name}". Type 'help' for available commands.`,
      type: 'error',
    };
  }

  switch (cmd.name) {
    case 'help': {
      if (args.length > 0) {
        const target = config.commands.find(
          (c) => c.name === args[0] || c.aliases.includes(args[0] ?? ''),
        );
        if (target) {
          return {
            command: name,
            args,
            output: `${target.name} — ${target.description}\nUsage: ${target.usage}\nAliases: ${target.aliases.join(', ')}`,
            type: 'info',
          };
        }
      }
      return {
        command: name,
        args,
        output: buildHelpText(config.commands, config.activeSkills),
        type: 'info',
      };
    }

    case 'skills':
      return {
        command: name,
        args,
        output:
          config.activeSkills.length > 0
            ? `Active skills:\n${config.activeSkills.map((s) => `  • ${s}`).join('\n')}`
            : 'No skills active. Run `weave skills enable <id>` to activate skills.',
        type: 'info',
      };

    case 'history': {
      const n = parseInt(args[0] ?? '10', 10);
      const slice = history.slice(-n);
      return {
        command: name,
        args,
        output:
          slice.length > 0
            ? slice.map((h, i) => `  ${i + 1}. ${h}`).join('\n')
            : 'No history yet.',
        type: 'info',
      };
    }

    case 'session':
      return {
        command: name,
        args,
        output: `Session ID: ${config.sessionId}\nActive skills: ${config.activeSkills.length}\nHistory entries: ${history.length}`,
        type: 'info',
      };

    case 'run': {
      const skillId = args[0];
      if (!skillId) {
        return {
          command: name,
          args,
          output: 'Usage: run <skill-id>',
          type: 'error',
        };
      }
      if (!config.activeSkills.includes(skillId)) {
        return {
          command: name,
          args,
          output: `Skill "${skillId}" is not active. Enable it with: weave skills enable ${skillId}`,
          type: 'error',
        };
      }
      return {
        command: name,
        args,
        output: `Running skill "${skillId}"… [dispatched to SkillRegistry]`,
        type: 'skill',
      };
    }

    case 'clear':
      return {
        command: name,
        args,
        output: '\x1B[2J\x1B[0f', // ANSI clear screen
        type: 'success',
      };

    case 'quit':
      return {
        command: name,
        args,
        output: 'Goodbye! 👋',
        type: 'success',
      };

    default:
      return {
        command: name,
        args,
        output: `Command "${cmd.name}" is registered but not yet implemented.`,
        type: 'info',
      };
  }
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const cliInteractiveSkill: SkillModule = {
  id: 'cli-interactive',
  name: 'CLI Interactive (REPL)',
  description:
    'Provides configuration and command dispatch for the `weave chat` REPL mode with persistent history and skill access.',
  version: '1.0.0',
  enabled: true,
  tags: ['cli', 'repl', 'dx', 'interactive'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const opts = (ctx.graph ?? {}) as Record<string, unknown>;

    const sessionId =
      (opts['sessionId'] as string | undefined) ??
      ctx.session?.id ??
      `repl-${Date.now()}`;

    const activeSkills = Array.isArray(opts['skills'])
      ? (opts['skills'] as string[])
      : [];

    const history = Array.isArray(opts['history'])
      ? (opts['history'] as string[])
      : [];

    const config: ReplConfig = {
      sessionId,
      prompt: 'weave> ',
      historyFile: '.weave/.repl_history',
      maxHistory: 500,
      activeSkills,
      commands: REPL_COMMANDS,
    };

    const helpText = buildHelpText(REPL_COMMANDS, activeSkills);
    const welcomeMessage = buildWelcomeMessage(sessionId);

    const result: CliInteractiveResult = {
      config,
      helpText,
      welcomeMessage,
    };

    // If a command was provided, simulate dispatch
    const rawCommand = opts['command'] as string | undefined;
    if (rawCommand) {
      const parsed = parseCommand(rawCommand);
      const cmdResult = dispatchCommand(parsed, config, history);
      result.commandResult = cmdResult;

      return {
        success: cmdResult.type !== 'error',
        output: cmdResult.output,
        data: result,
      };
    }

    return {
      success: true,
      output: welcomeMessage,
      data: result,
    };
  },
};
