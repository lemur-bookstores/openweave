/**
 * Config Generator — M8: Client Integrations
 *
 * Generates MCP server configuration objects compatible with
 * Claude Desktop, Cursor, VS Code, and other MCP clients.
 */

export interface WeaveLinkConfig {
  host?: string;
  port?: number;
  apiKey?: string;
}

export interface MCPClientEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPClientsConfig {
  mcpServers: Record<string, MCPClientEntry>;
}

// ──────────────────────────────────────────────────────────
// ConfigGenerator
// ──────────────────────────────────────────────────────────

export class ConfigGenerator {
  /**
   * Generate an MCP stdio-mode entry for a client's config file.
   * This is the standard mode for Claude Desktop and Cursor.
   *
   * The entry runs `weave-link start` via `npx` so no global install is needed.
   */
  static stdioEntry(config?: WeaveLinkConfig): MCPClientEntry {
    const args = ['@openweave/weave-link', 'start', '--mode', 'stdio'];

    if (config?.port) {
      args.push('--port', String(config.port));
    }

    const env: Record<string, string> = {};
    if (config?.apiKey) {
      env['WEAVE_API_KEY'] = config.apiKey;
    }

    const entry: MCPClientEntry = { command: 'npx', args };
    if (Object.keys(env).length > 0) {
      entry.env = env;
    }

    return entry;
  }

  /**
   * Generate an MCP HTTP-mode entry for remote WeaveLink connections.
   */
  static httpEntry(config?: WeaveLinkConfig): MCPClientEntry {
    const host = config?.host ?? '127.0.0.1';
    const port = config?.port ?? 3001;
    const args = ['@openweave/weave-link', 'start', '--mode', 'http', '--port', String(port), '--host', host];

    const env: Record<string, string> = {};
    if (config?.apiKey) {
      env['WEAVE_API_KEY'] = config.apiKey;
    }

    const entry: MCPClientEntry = { command: 'npx', args };
    if (Object.keys(env).length > 0) {
      entry.env = env;
    }

    return entry;
  }

  /**
   * Build a full `mcpServers` config block, ready to merge into the client's JSON.
   */
  static buildMCPConfig(
    serverName = 'openweave',
    mode: 'stdio' | 'http' = 'stdio',
    config?: WeaveLinkConfig
  ): MCPClientsConfig {
    const entry = mode === 'http'
      ? ConfigGenerator.httpEntry(config)
      : ConfigGenerator.stdioEntry(config);

    return {
      mcpServers: {
        [serverName]: entry,
      },
    };
  }

  /**
   * Format a config object as indented JSON for writing to disk.
   */
  static toJSON(config: unknown): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * Deep-merge a WeaveLink entry into an existing client config object.
   * Preserves all existing `mcpServers` entries and only overwrites the
   * `openweave` key.
   */
  static mergeIntoExisting(
    existing: MCPClientsConfig,
    serverName = 'openweave',
    mode: 'stdio' | 'http' = 'stdio',
    config?: WeaveLinkConfig
  ): MCPClientsConfig {
    const entry = mode === 'http'
      ? ConfigGenerator.httpEntry(config)
      : ConfigGenerator.stdioEntry(config);

    return {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers ?? {}),
        [serverName]: entry,
      },
    };
  }
}
