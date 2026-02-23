#!/usr/bin/env node
/**
 * agent-core CLI
 *
 * Usage:
 *   agent-core start [--session <id>] [--chat <id>] [--verbose]
 *   agent-core status
 *   agent-core sessions
 *
 * The `start` command boots an interactive REPL.
 * The agent reads from stdin line-by-line and writes responses to stdout.
 * All session state is persisted to .weave-sessions/.
 *
 * Environment variables:
 *   WEAVE_LLM_PROVIDER   openai | anthropic | ollama | mock (default: mock)
 *   WEAVE_LLM_MODEL      Model name (default depends on provider)
 *   WEAVE_LLM_BASE_URL   Override base URL
 *   WEAVE_LLM_API_KEY    API key
 *   WEAVE_SESSION_DIR    Persistence dir (default: .weave-sessions)
 */

import * as readline from 'node:readline';
import { AgentCore } from './agent-core.js';
import { SessionLifecycle } from './session-lifecycle.js';
import type { LLMClient, AgentMessage } from './types.js';

// ──────────────────────────────────────────────────────────
// Arg parser
// ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else { positional.push(a); if (positional.length === 1) args['command'] = a; }
  }
  return args;
}

// ──────────────────────────────────────────────────────────
// Mock LLM client (used when provider=mock or no API key)
// ──────────────────────────────────────────────────────────

class MockLLMClient implements LLMClient {
  async complete(messages: AgentMessage[]): Promise<AgentMessage> {
    const last = messages[messages.length - 1];
    return {
      role: 'assistant',
      content: `[mock] Received: "${last?.content ?? ''}". Use a real LLM provider for actual responses.`,
    };
  }
}

// ──────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────

async function cmdStart(args: Record<string, string | boolean>): Promise<void> {
  const sessionId = (args['session'] as string) || undefined;
  const chatId = (args['chat'] as string) || undefined;
  const verbose = args['verbose'] === true;
  const persistenceDir = (process.env['WEAVE_SESSION_DIR'] as string) || '.weave-sessions';

  const provider = (process.env['WEAVE_LLM_PROVIDER'] as string) || 'mock';
  const llm: LLMClient = provider === 'mock' ? new MockLLMClient() : new MockLLMClient();

  const agent = new AgentCore(llm, {
    sessionId,
    chatId,
    persistenceDir,
    llm: {
      provider: provider as 'mock',
      model: process.env['WEAVE_LLM_MODEL'] ?? 'gpt-4o',
      baseUrl: process.env['WEAVE_LLM_BASE_URL'],
      apiKey: process.env['WEAVE_LLM_API_KEY'],
    },
    run: { verbose },
  });

  const session = await agent.init();
  console.log(`[OpenWeave] Session started: ${session.sessionId}`);
  console.log(`[OpenWeave] Chat ID: ${session.chatId}`);
  if (provider === 'mock') {
    console.log(`[OpenWeave] ⚠ Running with mock LLM. Set WEAVE_LLM_PROVIDER to use a real model.\n`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (): void => rl.question('you> ', async (line) => {
    const input = line.trim();
    if (!input || input === '/exit' || input === '/quit') {
      await agent.close();
      console.log('[OpenWeave] Session closed. Goodbye.');
      rl.close();
      return;
    }
    try {
      const result = await agent.run(input, { verbose });
      console.log(`\nagent> ${result.output}`);
      if (verbose) {
        console.log(`  ↳ iterations=${result.iterations} tools=${result.toolResults.length} stop=${result.stopReason}`);
        console.log(`  ↳ tokens window=${result.tokenUsage.windowTokens} util=${(result.tokenUsage.utilisation * 100).toFixed(1)}%`);
      }
      console.log('');
    } catch (err) {
      console.error(`[AgentCore error] ${(err as Error).message}`);
    }
    prompt();
  });

  prompt();

  process.on('SIGINT', async () => {
    console.log('\n[OpenWeave] Shutting down…');
    await agent.close();
    rl.close();
    process.exit(0);
  });
}

function cmdSessions(args: Record<string, string | boolean>): void {
  const dir = (args['dir'] as string) || (process.env['WEAVE_SESSION_DIR'] as string) || '.weave-sessions';
  const lc = new SessionLifecycle(dir);
  const ids = lc.listSessionIds();
  if (ids.length === 0) {
    console.log(`No sessions found in ${dir}`);
    return;
  }
  console.log(`Sessions in ${dir}:`);
  for (const id of ids) {
    const info = lc.load(id);
    if (info) {
      console.log(`  ${id}  [${info.status}]  turns=${info.turnCount}  started=${info.startedAt}`);
    }
  }
}

function cmdStatus(): void {
  console.log('OpenWeave Agent Core v0.1.0');
  console.log(`Node: ${process.version}`);
  console.log(`Provider: ${process.env['WEAVE_LLM_PROVIDER'] ?? 'mock'}`);
  console.log(`Session dir: ${process.env['WEAVE_SESSION_DIR'] ?? '.weave-sessions'}`);
}

// ──────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const command = (args['command'] as string) ?? 'start';

switch (command) {
  case 'start':
    await cmdStart(args);
    break;
  case 'sessions':
    cmdSessions(args);
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
