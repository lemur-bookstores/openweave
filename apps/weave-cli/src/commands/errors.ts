import { existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand } from '../types';
import { resolveProjectRoot } from '../utils';

interface ErrorEntry {
  id: string;
  error_type: string;
  message: string;
  file: string;
  line: number;
  timestamp: string;
  severity: 'error' | 'warning' | 'info';
  suppressed: boolean;
  correction?: string;
}

/**
 * Errors Command - View error registry
 */
export class ErrorsCommand implements CliCommand {
  name = 'errors';
  description = 'Show error registry and suppression status';
  usage = 'weave errors [--type=all] [--filter=active]';
  flags = {
    type: {
      short: 't',
      description:
        'Filter by error type: all, runtime, syntax, type, semantic',
      default: 'all',
    },
    filter: {
      short: 'f',
      description: 'Filter: all, active, suppressed (default: all)',
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
      const projectRoot = resolveProjectRoot(args.flags.root as string | undefined);
      const weaveDir = join(projectRoot, '.weave');

      if (!existsSync(weaveDir)) {
        return {
          success: false,
          message: 'Error: .weave directory not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      // Mock error registry
      const mockErrors: ErrorEntry[] = [
        {
          id: 'e1',
          error_type: 'runtime',
          message: 'Null pointer exception in data processing',
          file: 'src/processors/data.ts',
          line: 142,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
            .toISOString(),
          severity: 'error',
          suppressed: false,
          correction:
            'Added null check before accessing property. Fixed in commit abc123.',
        },
        {
          id: 'e2',
          error_type: 'type',
          message: 'Type mismatch: Expected string, got number',
          file: 'src/types/config.ts',
          line: 28,
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000)
            .toISOString(),
          severity: 'error',
          suppressed: true,
          correction: 'Type coercion applied. Investigate further.',
        },
        {
          id: 'e3',
          error_type: 'syntax',
          message: 'Missing semicolon',
          file: 'src/index.ts',
          line: 5,
          timestamp: new Date(Date.now() - 3000).toISOString(),
          severity: 'warning',
          suppressed: false,
        },
        {
          id: 'e4',
          error_type: 'semantic',
          message: 'Unused import statement',
          file: 'src/utils/helpers.ts',
          line: 12,
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000)
            .toISOString(),
          severity: 'info',
          suppressed: true,
        },
      ];

      const typeFilter = (args.flags.type as string) || 'all';
      const filter = (args.flags.filter as string) || 'all';

      let results = mockErrors;

      if (typeFilter !== 'all') {
        results = results.filter(
          (e) => e.error_type === typeFilter.toLowerCase()
        );
      }

      if (filter === 'active') {
        results = results.filter((e) => !e.suppressed);
      } else if (filter === 'suppressed') {
        results = results.filter((e) => e.suppressed);
      }

      if (args.flags.json) {
        return {
          success: true,
          message: JSON.stringify(results, null, 2),
          data: {
            total: results.length,
            active: results.filter((e) => !e.suppressed).length,
            suppressed: results.filter((e) => e.suppressed).length,
            errors: results,
          },
        };
      }

      let output = '\n📋 Error Registry\n';
      output += '='.repeat(60) + '\n';

      if (results.length === 0) {
        output += '✨ No errors to display!\n';
      } else {
        for (const error of results) {
          output += this.formatError(error);
        }
      }

      output += '\n' + '='.repeat(60) + '\n';
      output += `Active: ${results.filter((e) => !e.suppressed).length} | `;
      output += `Suppressed: ${results.filter((e) => e.suppressed).length}\n`;

      return {
        success: true,
        message: output,
        data: {
          total: results.length,
          active: results.filter((e) => !e.suppressed).length,
          suppressed: results.filter((e) => e.suppressed).length,
          errors: results,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error reading error registry',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private formatError(error: ErrorEntry): string {
    const statusIcon = error.suppressed ? '🔇' : '🔴';
    const typeIcon = this.getTypeIcon(error.error_type);
    const severityColor = this.getSeverityIcon(error.severity);

    let output = `\n${statusIcon} ${typeIcon} [${error.error_type.toUpperCase()}] `;
    output += `${severityColor} ${error.severity.toUpperCase()}\n`;
    output += `   Message: ${error.message}\n`;
    output += `   Location: ${error.file}:${error.line}\n`;
    output += `   Time: ${new Date(error.timestamp).toLocaleString()}\n`;
    output += `   ID: ${error.id}\n`;

    if (error.correction) {
      output += `   Fix: ${error.correction}\n`;
    }

    return output;
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      runtime: '⚡',
      type: '🔤',
      syntax: '📝',
      semantic: '🧠',
      default: '❓',
    };
    return icons[type.toLowerCase()] || icons.default;
  }

  private getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
    };
    return icons[severity.toLowerCase()] || '❓';
  }
}

export const errorsCommand = new ErrorsCommand();
