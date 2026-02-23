/**
 * Cursor Installer — M8: Client Integrations
 *
 * Generates or updates Cursor's MCP config file.
 *
 * Cursor MCP config path:
 *   Global : ~/.cursor/mcp.json
 *   Project: <workspaceRoot>/.cursor/mcp.json
 *
 * The project-level config takes priority over the global one.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigGenerator, MCPClientsConfig, WeaveLinkConfig } from './config-generator';

export type CursorScope = 'global' | 'project';

export interface CursorInstallResult {
  success: boolean;
  configPath: string;
  scope: CursorScope;
  message: string;
  configWritten?: string;
}

// ──────────────────────────────────────────────────────────
// CursorInstaller
// ──────────────────────────────────────────────────────────

export class CursorInstaller {
  /**
   * Resolve the Cursor MCP config path for the given scope.
   *
   * @param scope         'global' (default) or 'project'
   * @param workspaceRoot Required when scope is 'project'
   */
  static getConfigPath(scope: CursorScope = 'global', workspaceRoot?: string): string {
    if (scope === 'project') {
      const root = workspaceRoot ?? process.cwd();
      return path.join(root, '.cursor', 'mcp.json');
    }
    return path.join(os.homedir(), '.cursor', 'mcp.json');
  }

  /**
   * Read the current Cursor MCP config.
   * Returns `{ mcpServers: {} }` if the file doesn't exist yet.
   */
  static async readConfig(configPath: string): Promise<MCPClientsConfig> {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(raw) as MCPClientsConfig;
    } catch {
      return { mcpServers: {} };
    }
  }

  /**
   * Install (or update) the WeaveLink entry in Cursor's MCP config.
   *
   * @param scope         'global' (default) or 'project'
   * @param workspaceRoot Path to workspace root (required for project scope)
   * @param config        Optional WeaveLink connection config
   * @param mode          'stdio' (default) or 'http'
   */
  static async install(
    scope: CursorScope = 'global',
    workspaceRoot?: string,
    config?: WeaveLinkConfig,
    mode: 'stdio' | 'http' = 'stdio'
  ): Promise<CursorInstallResult> {
    const cfgPath = CursorInstaller.getConfigPath(scope, workspaceRoot);

    try {
      await fs.mkdir(path.dirname(cfgPath), { recursive: true });

      const existing = await CursorInstaller.readConfig(cfgPath);
      const updated = ConfigGenerator.mergeIntoExisting(existing, 'openweave', mode, config);
      const json = ConfigGenerator.toJSON(updated);

      await fs.writeFile(cfgPath, json, 'utf-8');

      return {
        success: true,
        configPath: cfgPath,
        scope,
        message: `WeaveLink MCP entry added to Cursor ${scope} config.\nRestart Cursor to apply changes.`,
        configWritten: json,
      };
    } catch (err) {
      return {
        success: false,
        configPath: cfgPath,
        scope,
        message: `Failed to install: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Remove the WeaveLink entry from Cursor's MCP config.
   */
  static async uninstall(
    scope: CursorScope = 'global',
    workspaceRoot?: string
  ): Promise<CursorInstallResult> {
    const cfgPath = CursorInstaller.getConfigPath(scope, workspaceRoot);

    try {
      const existing = await CursorInstaller.readConfig(cfgPath);

      if (!existing.mcpServers?.['openweave']) {
        return {
          success: true,
          configPath: cfgPath,
          scope,
          message: 'WeaveLink entry not found — nothing to remove.',
        };
      }

      const { ['openweave']: _removed, ...rest } = existing.mcpServers;
      const updated: MCPClientsConfig = { ...existing, mcpServers: rest };
      const json = ConfigGenerator.toJSON(updated);

      await fs.writeFile(cfgPath, json, 'utf-8');

      return {
        success: true,
        configPath: cfgPath,
        scope,
        message: `WeaveLink MCP entry removed from Cursor ${scope} config.`,
        configWritten: json,
      };
    } catch (err) {
      return {
        success: false,
        configPath: cfgPath,
        scope,
        message: `Failed to uninstall: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Check if Cursor is installed by looking for the ~/.cursor directory.
   */
  static async isInstalled(): Promise<boolean> {
    try {
      await fs.access(path.join(os.homedir(), '.cursor'));
      return true;
    } catch {
      return false;
    }
  }
}
