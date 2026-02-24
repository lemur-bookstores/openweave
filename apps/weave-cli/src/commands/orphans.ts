import { existsSync } from 'fs';
import { join } from 'path';
import { CLIArgs, CommandResult, CliCommand } from '../types';
import { resolveProjectRoot } from '../utils';

interface OrphanEntity {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Orphans Command - Detect unused code
 */
export class OrphansCommand implements CliCommand {
  name = 'orphans';
  description = 'Analyze code for orphaned (unused) entities';
  usage = 'weave orphans [--severity=all] [--type=all]';
  flags = {
    severity: {
      short: 's',
      description: 'Filter by severity: all, critical, high, medium, low',
      default: 'all',
    },
    type: {
      short: 't',
      description: 'Filter by entity type: all, function, class, variable',
      default: 'all',
    },
    'include-tests': {
      short: 'i',
      description: 'Include test files in analysis',
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
      const projectRoot = resolveProjectRoot(args.flags.root as string | undefined);
      const weaveDir = join(projectRoot, '.weave');
      const configPath = join(weaveDir, 'config.json');

      if (!existsSync(configPath)) {
        return {
          success: false,
          message: 'Error: .weave directory not found',
          error: 'Please run "weave init <project-name>" first',
        };
      }

      // Mock orphans data for demonstration
      const mockOrphans: OrphanEntity[] = [
        {
          id: 'o1',
          name: 'legacyParser',
          type: 'function',
          file: 'src/utils/parser.ts',
          line: 42,
          severity: 'high',
          description: 'Parser function with no external references. Possibly replaced by new implementation.',
        },
        {
          id: 'o2',
          name: 'validateConfig',
          type: 'function',
          file: 'src/validators/config.ts',
          line: 15,
          severity: 'medium',
          description: 'Exported function but only used internally in test files.',
        },
        {
          id: 'o3',
          name: 'DeprecatedClass',
          type: 'class',
          file: 'src/core/deprecated.ts',
          line: 8,
          severity: 'critical',
          description: 'Class marked as exported but has no usages outside module. Consider removing.',
        },
        {
          id: 'o4',
          name: 'tempCache',
          type: 'variable',
          file: 'src/state/cache.ts',
          line: 101,
          severity: 'low',
          description: 'Module-level variable possibly being phased out.',
        },
      ];

      const severity = (args.flags.severity as string) || 'all';
      const typeFilter = (args.flags.type as string) || 'all';

      let results = mockOrphans;

      if (severity !== 'all') {
        results = results.filter((o) => o.severity === severity);
      }

      if (typeFilter !== 'all') {
        results = results.filter(
          (o) => o.type.toLowerCase() === typeFilter.toLowerCase()
        );
      }

      if (args.flags.json) {
        return {
          success: true,
          message: JSON.stringify(results, null, 2),
          data: {
            total: results.length,
            by_severity: this.groupBySeverity(results),
            orphans: results,
          },
        };
      }

      let output = '\n🔎 Code Analysis: Orphaned Entities\n';
      output += '='.repeat(60) + '\n';

      if (results.length === 0) {
        output += '✨ No orphaned entities detected!\n';
      } else {
        const bySeverity = this.groupBySeverity(results);

        for (const sev of ['critical', 'high', 'medium', 'low']) {
          if (bySeverity[sev] && bySeverity[sev].length > 0) {
            output += `\n${this.getSeverityIcon(sev as any)} ${sev.toUpperCase()} (${bySeverity[sev].length})\n`;
            output += '-'.repeat(40) + '\n';

            for (const orphan of bySeverity[sev]) {
              output += this.formatOrphan(orphan);
            }
          }
        }
      }

      output += '\n' + '='.repeat(60) + '\n';
      output += `Total orphaned entities: ${results.length}\n`;
      output += 'Recommendation: Remove or refactor unused code regularly.\n';

      return {
        success: true,
        message: output,
        data: {
          total: results.length,
          by_severity: this.groupBySeverity(results),
          orphans: results,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error analyzing orphans',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private groupBySeverity(orphans: OrphanEntity[]): Record<string, OrphanEntity[]> {
    return {
      critical: orphans.filter((o) => o.severity === 'critical'),
      high: orphans.filter((o) => o.severity === 'high'),
      medium: orphans.filter((o) => o.severity === 'medium'),
      low: orphans.filter((o) => o.severity === 'low'),
    };
  }

  private getSeverityIcon(
    severity: 'critical' | 'high' | 'medium' | 'low'
  ): string {
    const icons = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    };
    return icons[severity];
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      function: '📌',
      class: '🏛️',
      variable: '📦',
      interface: '📋',
      enum: '📊',
      default: '❓',
    };
    return icons[type.toLowerCase()] || icons.default;
  }

  private formatOrphan(orphan: OrphanEntity): string {
    let output = `   ${this.getTypeIcon(orphan.type)} ${orphan.name}\n`;
    output += `       File: ${orphan.file}:${orphan.line}\n`;
    output += `       ${orphan.description}\n`;
    return output;
  }
}

export const orphansCommand = new OrphansCommand();
