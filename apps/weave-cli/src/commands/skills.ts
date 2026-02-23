import { join } from 'node:path';
import { CLIArgs, CommandResult, CliCommand } from '../types.js';
import {
  loadSkillConfig,
  setSkillEnabled,
  CONFIG_FILENAME,
} from '@openweave/weave-skills';

/**
 * SkillsCommand — manage OpenWeave skill modules
 *
 * Subcommands:
 *   weave skills list                  List all skills and their enabled state
 *   weave skills enable <id>           Enable a skill in .weave.config.json
 *   weave skills disable <id>          Disable a skill in .weave.config.json
 *   weave skills info <id>             Show config entry for a skill
 */
export const skillsCommand: CliCommand = {
  name: 'skills',
  description: 'Manage OpenWeave skill modules',
  usage: 'weave skills <list|enable|disable|info> [skill-id]',
  flags: {
    json: {
      short: 'j',
      description: 'Output as JSON',
      default: false,
    },
  },

  async execute(args: CLIArgs): Promise<CommandResult> {
    const sub = args.args[0] ?? 'list';
    const skillId = args.args[1];
    const outputJson = Boolean(args.flags.json);
    const projectRoot = process.cwd();

    switch (sub) {
      case 'list':
        return handleList(projectRoot, outputJson);

      case 'enable': {
        if (!skillId) {
          return {
            success: false,
            message: '❌ Usage: weave skills enable <skill-id>',
            error: 'Missing skill id',
          };
        }
        return handleSetEnabled(projectRoot, skillId, true, outputJson);
      }

      case 'disable': {
        if (!skillId) {
          return {
            success: false,
            message: '❌ Usage: weave skills disable <skill-id>',
            error: 'Missing skill id',
          };
        }
        return handleSetEnabled(projectRoot, skillId, false, outputJson);
      }

      case 'info': {
        if (!skillId) {
          return {
            success: false,
            message: '❌ Usage: weave skills info <skill-id>',
            error: 'Missing skill id',
          };
        }
        return handleInfo(projectRoot, skillId, outputJson);
      }

      default:
        return {
          success: false,
          message: `❌ Unknown subcommand: "${sub}"\n\nUsage: weave skills <list|enable|disable|info>`,
          error: `Unknown subcommand: ${sub}`,
        };
    }
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleList(projectRoot: string, outputJson: boolean): CommandResult {
  const config = loadSkillConfig(projectRoot);
  const entries = Object.entries(config.skills);

  if (outputJson) {
    return {
      success: true,
      message: JSON.stringify(config.skills, null, 2),
      data: config.skills,
    };
  }

  const configFile = join(projectRoot, CONFIG_FILENAME);

  if (entries.length === 0) {
    return {
      success: true,
      message: [
        '',
        '🔧 OpenWeave Skills',
        '─'.repeat(50),
        '',
        '  No skills configured yet.',
        '',
        '  Skills are enabled/disabled in:',
        `  ${configFile}`,
        '',
        '  Example:',
        '    weave skills enable auto-fix',
        '    weave skills enable code-review',
        '',
        '  Available skill ids (Phase 9):',
        '    auto-fix · code-review · test-gen · docs-gen · refactor',
        '    pipeline-aware · dep-audit · perf-profile · container-advisor · deploy-provision',
        '    onboarding · commit-composer · context-memory · multi-repo · cli-interactive',
        '',
      ].join('\n'),
    };
  }

  const rows = entries.map(([id, enabled]) => {
    const icon = enabled ? '✅' : '⬜';
    const state = enabled ? 'enabled ' : 'disabled';
    return `  ${icon}  ${state}  ${id}`;
  });

  return {
    success: true,
    message: [
      '',
      '🔧 OpenWeave Skills',
      '─'.repeat(50),
      '',
      ...rows,
      '',
      `  Config: ${configFile}`,
      '',
      '  weave skills enable <id>   — activate a skill',
      '  weave skills disable <id>  — deactivate a skill',
      '',
    ].join('\n'),
    data: config.skills,
  };
}

function handleSetEnabled(
  projectRoot: string,
  skillId: string,
  enabled: boolean,
  outputJson: boolean
): CommandResult {
  try {
    setSkillEnabled(skillId, enabled, projectRoot);

    const action = enabled ? 'enabled' : 'disabled';
    const icon = enabled ? '✅' : '⬜';
    const data = { skillId, enabled };

    if (outputJson) {
      return { success: true, message: JSON.stringify(data, null, 2), data };
    }

    return {
      success: true,
      message: `\n${icon} Skill '${skillId}' ${action} in ${CONFIG_FILENAME}\n`,
      data,
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ Failed to update skill config`,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function handleInfo(projectRoot: string, skillId: string, outputJson: boolean): CommandResult {
  const config = loadSkillConfig(projectRoot);
  const hasEntry = skillId in config.skills;

  if (!hasEntry) {
    if (outputJson) {
      return {
        success: false,
        message: JSON.stringify({ skillId, configured: false }),
        data: { skillId, configured: false },
      };
    }
    return {
      success: false,
      message: [
        '',
        `⚠️  Skill '${skillId}' is not in ${CONFIG_FILENAME}`,
        '',
        `  To add it:`,
        `    weave skills enable ${skillId}`,
        `    weave skills disable ${skillId}`,
        '',
      ].join('\n'),
      error: `Skill '${skillId}' not configured`,
    };
  }

  const enabled = config.skills[skillId];
  const data = { skillId, enabled, configured: true };

  if (outputJson) {
    return { success: true, message: JSON.stringify(data, null, 2), data };
  }

  return {
    success: true,
    message: [
      '',
      `🔧 Skill: ${skillId}`,
      '─'.repeat(40),
      `  Status : ${enabled ? '✅ enabled' : '⬜ disabled'}`,
      `  Config : ${join(projectRoot, CONFIG_FILENAME)}`,
      '',
    ].join('\n'),
    data,
  };
}
