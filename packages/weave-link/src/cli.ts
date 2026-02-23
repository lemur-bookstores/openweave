#!/usr/bin/env node
/**
 * WeaveLink CLI — M8/M9: Server + Installer Entry Point
 *
 * Commands:
 *   weave-link start [options]   Start the HTTP or stdio server
 *   weave-link install claude    Install into Claude Desktop
 *   weave-link install cursor    Install into Cursor (global or project scope)
 *   weave-link uninstall claude  Remove from Claude Desktop
 *   weave-link uninstall cursor  Remove from Cursor
 *   weave-link status            Show server info / config paths
 *   weave-link keygen            Generate a new random API key
 *
 * Options (for `start`):
 *   --port  <n>          Port to listen on (default: 3001)
 *   --host  <h>          Host to bind to (default: 127.0.0.1)
 *   --mode  stdio|http   Transport mode (default: http)
 *   --no-auth            Disable API key auth
 *   --verbose            Enable verbose logging
 */

import { WeaveLinkServer } from './mcp-server';
import { AuthManager, generateApiKey } from './auth';
import { HttpTransport } from './http-transport';
import { ClaudeDesktopInstaller } from './installer/claude-desktop';
import { CursorInstaller } from './installer/cursor';

// ──────────────────────────────────────────────────────────
// Arg parser (zero dependencies — no yargs/commander)
// ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(arg);
      if (positional.length === 1) args['command'] = arg;
      if (positional.length === 2) args['subcommand'] = arg;
    }
  }

  return args;
}

// ──────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────

async function cmdStart(args: Record<string, string | boolean>): Promise<void> {
  const mode = (args['mode'] as string) ?? 'http';
  const port = parseInt((args['port'] as string) ?? '3001', 10);
  const host = (args['host'] as string) ?? '127.0.0.1';
  const noAuth = args['no-auth'] === true;
  const verbose = args['verbose'] === true;

  const apiKey = (process.env['WEAVE_API_KEY'] as string) || (args['api-key'] as string);

  const auth = new AuthManager({
    enabled: !noAuth && Boolean(apiKey),
    apiKeys: apiKey ? [apiKey] : [],
  });

  const server = new WeaveLinkServer();

  if (mode === 'stdio') {
    // stdio mode: accept JSON-RPC on stdin, write to stdout
    await server.initialize();
    console.error(`[WeaveLink] stdio mode ready. Auth: ${auth.isEnabled() ? 'enabled' : 'disabled'}`);
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', async (chunk: string) => {
      try {
        const msg = JSON.parse(chunk.trim());
        const result = await server.callTool(msg.tool ?? msg.method, msg.args ?? msg.params ?? {});
        process.stdout.write(JSON.stringify(result) + '\n');
      } catch (err) {
        process.stdout.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      }
    });
    return;
  }

  // HTTP mode
  const transport = new HttpTransport(server, auth, { port, host, cors: true, verbose: true });

  await transport.start();

  console.log(`[WeaveLink] HTTP server started`);
  console.log(`  URL   : http://${host}:${port}`);
  console.log(`  Auth  : ${auth.isEnabled() ? `enabled (${auth.getKeyCount()} key(s))` : 'disabled'}`);
  console.log(`  Tools : ${server.listTools().length} tools registered`);
  if (!auth.isEnabled() && !noAuth) {
    console.warn(
      `\n  ⚠  No WEAVE_API_KEY set. Running without authentication.\n     Set --api-key <key> or WEAVE_API_KEY env var to enable auth.\n`
    );
  }

  if (verbose) {
    console.log(`\n  Endpoints:`);
    console.log(`    GET  http://${host}:${port}/           → server info`);
    console.log(`    GET  http://${host}:${port}/health     → liveness check`);
    console.log(`    GET  http://${host}:${port}/tools      → list tools`);
    console.log(`    POST http://${host}:${port}/tools/call → invoke tool`);
    console.log(`    GET  http://${host}:${port}/events     → SSE stream\n`);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[WeaveLink] Shutting down…');
    await transport.stop();
    process.exit(0);
  });
}

async function cmdInstall(
  subcommand: string,
  args: Record<string, string | boolean>
): Promise<void> {
  const mode = (args['mode'] as 'stdio' | 'http') ?? 'stdio';
  const port = args['port'] ? parseInt(args['port'] as string, 10) : undefined;
  const apiKey = (args['api-key'] as string) || process.env['WEAVE_API_KEY'];

  const wlConfig = { port, apiKey };

  if (subcommand === 'claude') {
    const result = await ClaudeDesktopInstaller.install(wlConfig, mode);
    console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    console.log(`   Config: ${result.configPath}`);
  } else if (subcommand === 'cursor') {
    const scope = args['global'] ? 'global' : args['project'] ? 'project' : 'global';
    const workspaceRoot = scope === 'project' ? process.cwd() : undefined;
    const result = await CursorInstaller.install(scope, workspaceRoot, wlConfig, mode);
    console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    console.log(`   Config: ${result.configPath}`);
  } else {
    console.error(`Unknown install target: ${subcommand}`);
    console.error('Available targets: claude, cursor');
    process.exit(1);
  }
}

async function cmdUninstall(subcommand: string, args: Record<string, string | boolean>): Promise<void> {
  if (subcommand === 'claude') {
    const result = await ClaudeDesktopInstaller.uninstall();
    console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    console.log(`   Config: ${result.configPath}`);
  } else if (subcommand === 'cursor') {
    const scope = args['global'] ? 'global' : args['project'] ? 'project' : 'global';
    const result = await CursorInstaller.uninstall(scope);
    console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    console.log(`   Config: ${result.configPath}`);
  } else {
    console.error(`Unknown uninstall target: ${subcommand}`);
    process.exit(1);
  }
}

function cmdStatus(): void {
  console.log('WeaveLink Server Info');
  console.log('─────────────────────');
  const server = new WeaveLinkServer();
  const info = server.getServerInfo();
  console.log(`Name   : ${info.name}`);
  console.log(`Version: ${info.version}`);
  console.log(`Tools  : ${info.tools.length}`);
  info.tools.forEach(t => console.log(`  - ${t.name}: ${t.description}`));
  console.log('\nConfig Paths:');
  console.log(`  Claude Desktop: ${ClaudeDesktopInstaller.getConfigPath()}`);
  console.log(`  Cursor (global): ${CursorInstaller.getConfigPath('global')}`);
  console.log(`  Cursor (project): ${CursorInstaller.getConfigPath('project', process.cwd())}`);
}

function cmdKeygen(): void {
  const key = generateApiKey();
  console.log(`Generated API key:\n\n  ${key}\n\nSet it via: WEAVE_API_KEY=${key}`);
}

function cmdHelp(): void {
  console.log(`
WeaveLink — OpenWeave MCP Server

USAGE
  weave-link <command> [options]

COMMANDS
  start                Start the WeaveLink server
  install <target>     Install WeaveLink into an AI client (claude, cursor)
  uninstall <target>   Remove WeaveLink from an AI client
  status               Show server info and config paths
  keygen               Generate a new random API key
  help                 Show this help message

START OPTIONS
  --mode  <stdio|http>  Transport mode (default: http)
  --port  <port>        Port to listen on (default: 3001)
  --host  <host>        Host to bind to (default: 127.0.0.1)
  --api-key <key>       API key (or use WEAVE_API_KEY env var)
  --no-auth             Disable API key authentication
  --verbose             Enable verbose output

INSTALL OPTIONS
  --mode <stdio|http>   Config mode to generate (default: stdio)
  --port <port>         Port (for http mode)
  --global              Install at global scope (Cursor)
  --project             Install at project scope (Cursor)

EXAMPLES
  weave-link start --port 3001 --api-key mykey
  weave-link start --mode stdio --no-auth
  weave-link install claude
  weave-link install cursor --project
  WEAVE_API_KEY=mykey weave-link start
`);
}

// ──────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args['command'] as string;
  const subcommand = args['subcommand'] as string;

  switch (command) {
    case 'start':
      await cmdStart(args);
      break;
    case 'install':
      await cmdInstall(subcommand, args);
      break;
    case 'uninstall':
      await cmdUninstall(subcommand, args);
      break;
    case 'status':
      cmdStatus();
      break;
    case 'keygen':
      cmdKeygen();
      break;
    case 'help':
    case '--help':
    case undefined:
      cmdHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[WeaveLink] Fatal error:', err);
  process.exit(1);
});
