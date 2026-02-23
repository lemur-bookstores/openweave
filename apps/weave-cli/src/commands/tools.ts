import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CLIArgs, CommandResult, CliCommand } from '../types.js';
import { validateManifest, type ToolManifest } from '@openweave/weave-tools';
import { ToolStore } from '@openweave/weave-tools';

/**
 * ToolsCommand — manage external tool adapters
 *
 * Subcommands:
 *   weave tools list                              List all registered tools
 *   weave tools add <url|./path>                  Register tool from URL or local file
 *   weave tools remove <id>                       Remove a registered tool
 *   weave tools info <id>                         Show tool manifest and status
 *   weave tools test <id> <action> [--args={}]    Invoke a tool action
 */
export const toolsCommand: CliCommand = {
  name: 'tools',
  description: 'Manage external tool adapters (add, remove, list, info, test)',
  usage: 'weave tools <list|add|remove|info|test> [args]',
  flags: {
    json: {
      short: 'j',
      description: 'Output as JSON',
      default: false,
    },
    args: {
      short: 'a',
      description: 'JSON arguments for test subcommand',
      default: '{}',
    },
  },

  async execute(cliArgs: CLIArgs): Promise<CommandResult> {
    const sub = cliArgs.args[0] ?? 'list';
    const outputJson = Boolean(cliArgs.flags.json);
    const projectRoot = process.cwd();
    const store = new ToolStore(projectRoot);

    switch (sub) {
      case 'list':
        return handleList(store, outputJson);

      case 'add': {
        const source = cliArgs.args[1];
        if (!source) {
          return {
            success: false,
            message: '❌ Usage: weave tools add <url|./path/to/manifest.tool.json>',
            error: 'Missing source',
          };
        }
        return handleAdd(source, store, projectRoot, outputJson);
      }

      case 'remove': {
        const id = cliArgs.args[1];
        if (!id) {
          return {
            success: false,
            message: '❌ Usage: weave tools remove <tool-id>',
            error: 'Missing tool id',
          };
        }
        return handleRemove(id, store, outputJson);
      }

      case 'info': {
        const id = cliArgs.args[1];
        if (!id) {
          return {
            success: false,
            message: '❌ Usage: weave tools info <tool-id>',
            error: 'Missing tool id',
          };
        }
        return handleInfo(id, store, outputJson);
      }

      case 'test': {
        const id = cliArgs.args[1];
        const action = cliArgs.args[2];
        if (!id || !action) {
          return {
            success: false,
            message: '❌ Usage: weave tools test <tool-id> <action-name> [--args={}]',
            error: 'Missing tool id or action',
          };
        }
        const rawArgs = String(cliArgs.flags.args ?? '{}');
        return handleTest(id, action, rawArgs, store, outputJson);
      }

      default:
        return {
          success: false,
          message: `❌ Unknown subcommand: "${sub}"\n\nUsage: weave tools <list|add|remove|info|test>`,
          error: `Unknown subcommand: ${sub}`,
        };
    }
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleList(store: ToolStore, outputJson: boolean): CommandResult {
  const tools = store.list();

  if (outputJson) {
    return {
      success: true,
      message: JSON.stringify({ tools }, null, 2),
      data: { tools },
    };
  }

  if (tools.length === 0) {
    return {
      success: true,
      message: '📭 No external tools registered.\n\nRun: weave tools add <url|./path>',
    };
  }

  const lines = [
    `🔧 External Tools (${tools.length} registered)`,
    '',
    ...tools.map((t) =>
      `  ${t.id.padEnd(24)} ${t.name.padEnd(30)} [${t.adapter}] v${t.version}  (${t.tools.length} action${t.tools.length === 1 ? '' : 's'})`,
    ),
    '',
    'Run `weave tools info <id>` for details.',
  ];

  return { success: true, message: lines.join('\n'), data: { tools } };
}

async function handleAdd(
  source: string,
  store: ToolStore,
  projectRoot: string,
  outputJson: boolean,
): Promise<CommandResult> {
  let manifest: ToolManifest;

  // Local file path
  if (source.startsWith('.') || source.startsWith('/')) {
    const filePath = source.startsWith('/') ? source : join(projectRoot, source);
    if (!existsSync(filePath)) {
      return {
        success: false,
        message: `❌ File not found: ${filePath}`,
        error: 'File not found',
      };
    }
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      return {
        success: false,
        message: `❌ Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { success: false, message: '❌ Invalid JSON in manifest file', error: 'Invalid JSON' };
    }
    const validation = validateManifest(parsed);
    if (!validation.valid) {
      return {
        success: false,
        message: `❌ Invalid manifest:\n${validation.errors.map((e) => `  • ${e}`).join('\n')}`,
        error: validation.errors.join(', '),
      };
    }
    manifest = parsed as ToolManifest;
  } else if (source.startsWith('http://') || source.startsWith('https://')) {
    // Remote URL — fetch the manifest
    let raw: string;
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return {
          success: false,
          message: `❌ HTTP ${res.status} fetching manifest from ${source}`,
          error: `HTTP ${res.status}`,
        };
      }
      raw = await res.text();
    } catch (err) {
      return {
        success: false,
        message: `❌ Failed to fetch manifest: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { success: false, message: '❌ Invalid JSON in remote manifest', error: 'Invalid JSON' };
    }
    const validation = validateManifest(parsed);
    if (!validation.valid) {
      return {
        success: false,
        message: `❌ Invalid manifest:\n${validation.errors.map((e) => `  • ${e}`).join('\n')}`,
        error: validation.errors.join(', '),
      };
    }
    manifest = parsed as ToolManifest;

    // Copy manifest to .weave/tools/
    const toolsDir = join(projectRoot, '.weave', 'tools');
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(join(toolsDir, `${manifest.id}.tool.json`), JSON.stringify(manifest, null, 2), 'utf8');
  } else {
    return {
      success: false,
      message: `❌ Unsupported source format: "${source}"\n\nSupported: ./path/to/manifest.tool.json · https://... · .weave/tools/<name>.tool.json`,
      error: 'Unsupported source',
    };
  }

  // Save to store
  store.add(manifest);

  if (outputJson) {
    return { success: true, message: JSON.stringify({ added: manifest }, null, 2), data: { added: manifest } };
  }

  const actions = manifest.tools.map((t) => `${manifest.id}__${t.name}`).join(', ');
  return {
    success: true,
    message: `✅ Tool registered: "${manifest.name}" (${manifest.id})\n   Adapter: ${manifest.adapter}  |  Actions: ${actions}`,
    data: { added: manifest },
  };
}

function handleRemove(id: string, store: ToolStore, outputJson: boolean): CommandResult {
  const removed = store.remove(id);
  if (!removed) {
    return {
      success: false,
      message: `❌ Tool not found: "${id}"\n\nRun \`weave tools list\` to see registered tools.`,
      error: `Tool not found: ${id}`,
    };
  }
  if (outputJson) {
    return { success: true, message: JSON.stringify({ removed: id }), data: { removed: id } };
  }
  return { success: true, message: `✅ Tool removed: ${id}`, data: { removed: id } };
}

function handleInfo(id: string, store: ToolStore, outputJson: boolean): CommandResult {
  const manifest = store.get(id);
  if (!manifest) {
    return {
      success: false,
      message: `❌ Tool not found: "${id}"`,
      error: `Tool not found: ${id}`,
    };
  }

  if (outputJson) {
    return { success: true, message: JSON.stringify(manifest, null, 2), data: manifest };
  }

  const lines = [
    `🔧 ${manifest.name} (${manifest.id})`,
    `   Description : ${manifest.description}`,
    `   Version     : ${manifest.version}`,
    `   Adapter     : ${manifest.adapter}`,
    manifest.endpoint ? `   Endpoint    : ${manifest.endpoint}` : null,
    manifest.scriptPath ? `   Script      : ${manifest.scriptPath}` : null,
    `   Timeout     : ${manifest.timeout_ms ?? 10_000}ms`,
    ``,
    `   Actions (${manifest.tools.length}):`,
    ...manifest.tools.map(
      (t) => `     • ${manifest.id}__${t.name.padEnd(20)} ${t.description}`,
    ),
  ].filter(Boolean);

  return { success: true, message: lines.join('\n'), data: manifest };
}

async function handleTest(
  id: string,
  action: string,
  rawArgs: string,
  store: ToolStore,
  outputJson: boolean,
): Promise<CommandResult> {
  const manifest = store.get(id);
  if (!manifest) {
    return {
      success: false,
      message: `❌ Tool not found: "${id}"`,
      error: `Tool not found: ${id}`,
    };
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return {
      success: false,
      message: `❌ Invalid JSON in --args: ${rawArgs}`,
      error: 'Invalid JSON args',
    };
  }

  const prefixedAction = action.includes('__') ? action : `${id}__${action}`;

  // Dynamically import the bridge to dispatch the call
  const { ExternalToolBridge } = await import('@openweave/weave-tools');
  const bridge = new ExternalToolBridge(process.cwd());
  bridge.registerManifest(manifest);

  const result = await bridge.execute(prefixedAction, args);

  if (outputJson) {
    return { success: result.success, message: JSON.stringify(result, null, 2), data: result };
  }

  if (!result.success) {
    return {
      success: false,
      message: `❌ Tool call failed: ${result.error}`,
      error: result.error,
    };
  }

  return {
    success: true,
    message: `✅ ${prefixedAction} (${result.durationMs}ms)\n${JSON.stringify(result.data, null, 2)}`,
    data: result,
  };
}
