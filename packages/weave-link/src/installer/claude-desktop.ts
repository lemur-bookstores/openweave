/**
 * Claude Desktop Installer — M8: Client Integrations
 *
 * Locates the Claude Desktop MCP config file on the current OS,
 * reads it, injects the WeaveLink `mcpServers` entry, and writes
 * the result back to disk.
 *
 * Claude Desktop config paths:
 *   Windows : %APPDATA%\Claude\claude_desktop_config.json
 *   macOS   : ~/Library/Application Support/Claude/claude_desktop_config.json
 *   Linux   : ~/.config/Claude/claude_desktop_config.json
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigGenerator, MCPClientsConfig, WeaveLinkConfig } from './config-generator';

export interface InstallResult {
  success: boolean;
  configPath: string;
  message: string;
  /** The final JSON written to disk (for inspection/logging) */
  configWritten?: string;
}

// ──────────────────────────────────────────────────────────
// ClaudeDesktopInstaller
// ──────────────────────────────────────────────────────────

export class ClaudeDesktopInstaller {
  /**
   * Resolve Claude Desktop's config file path for the current OS.
   */
  static getConfigPath(): string {
    const platform = process.platform;

    if (platform === 'win32') {
      const appData = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'Claude', 'claude_desktop_config.json');
    }

    if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }

    // Linux / other
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }

  /**
   * Check whether the Claude Desktop config directory exists.
   * Returns `true` if Claude Desktop appears to be installed.
   */
  static async isInstalled(configPath?: string): Promise<boolean> {
    const cfgPath = configPath ?? ClaudeDesktopInstaller.getConfigPath();
    try {
      await fs.access(path.dirname(cfgPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read the current Claude Desktop config.
   * Returns an empty `{ mcpServers: {} }` structure if the file doesn't exist yet.
   */
  static async readConfig(configPath?: string): Promise<MCPClientsConfig> {
    const cfgPath = configPath ?? ClaudeDesktopInstaller.getConfigPath();
    try {
      const raw = await fs.readFile(cfgPath, 'utf-8');
      return JSON.parse(raw) as MCPClientsConfig;
    } catch {
      return { mcpServers: {} };
    }
  }

  /**
   * Install (or update) the WeaveLink entry in Claude Desktop's config.
   *
   * @param config  Optional WeaveLink connection config.
   * @param mode    'stdio' (default) or 'http'.
   * @param configPath  Override the config file path (useful for testing).
   */
  static async install(
    config?: WeaveLinkConfig,
    mode: 'stdio' | 'http' = 'stdio',
    configPath?: string
  ): Promise<InstallResult> {
    const cfgPath = configPath ?? ClaudeDesktopInstaller.getConfigPath();

    try {
      // Ensure the directory exists
      await fs.mkdir(path.dirname(cfgPath), { recursive: true });

      // Read existing config
      const existing = await ClaudeDesktopInstaller.readConfig(cfgPath);

      // Merge WeaveLink entry
      const updated = ConfigGenerator.mergeIntoExisting(existing, 'openweave', mode, config);
      const json = ConfigGenerator.toJSON(updated);

      // Write back
      await fs.writeFile(cfgPath, json, 'utf-8');

      return {
        success: true,
        configPath: cfgPath,
        message: `WeaveLink MCP entry added to Claude Desktop config.\nRestart Claude Desktop to apply changes.`,
        configWritten: json,
      };
    } catch (err) {
      return {
        success: false,
        configPath: cfgPath,
        message: `Failed to install: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Remove the WeaveLink entry from Claude Desktop's config.
   */
  static async uninstall(configPath?: string): Promise<InstallResult> {
    const cfgPath = configPath ?? ClaudeDesktopInstaller.getConfigPath();

    try {
      const existing = await ClaudeDesktopInstaller.readConfig(cfgPath);

      if (!existing.mcpServers?.['openweave']) {
        return {
          success: true,
          configPath: cfgPath,
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
        message: 'WeaveLink MCP entry removed from Claude Desktop config.',
        configWritten: json,
      };
    } catch (err) {
      return {
        success: false,
        configPath: cfgPath,
        message: `Failed to uninstall: ${(err as Error).message}`,
      };
    }
  }
}
