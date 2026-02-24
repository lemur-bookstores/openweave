import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { WeaveNode } from '../types';

// ---------------------------------------------------------------------------
// Participant registration — gracefully no-ops when Copilot Chat is absent
// ---------------------------------------------------------------------------

const PARTICIPANT_ID = 'openweave';

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  client: WeaveExtensionClient,
): vscode.Disposable {
  if (!('chat' in vscode)) {
    // Copilot Chat extension is not installed — return a no-op disposable
    return { dispose: () => undefined };
  }

  const handler: vscode.ChatRequestHandler = async (request, _ctx, stream, token) => {
    // ---- Gate: must be connected -------------------------------------------
    if (client.status.state !== 'connected') {
      stream.markdown(
        '⚠️ **OpenWeave is not connected.**\n\n' +
        'Start WeaveLink or connect to a running server first:\n',
      );
      stream.button({ command: 'openweave.connect',     title: '$(plug) Connect Server'     });
      stream.button({ command: 'openweave.startServer', title: '$(play) Start WeaveLink'    });
      return;
    }

    const intent = resolveIntent(request);

    switch (intent.type) {
      case 'query':      return handleQuery(intent.text, client, stream, token);
      case 'save':       return handleSave(intent.text, client, stream, request, token);
      case 'milestones': return handleMilestones(client, stream, token);
      case 'status':     return handleStatus(client, stream);
      case 'sessions':   return handleSessions(client, stream, token);
      default:           return handleHelp(stream);
    }
  };

  // vscode.chat is dynamically available — cast to access createChatParticipant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chat = (vscode as any).chat as typeof vscode.chat;
  const participant = chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media/weave.svg');

  return participant;
}

// ---------------------------------------------------------------------------
// Intent resolver
// ---------------------------------------------------------------------------

type Intent =
  | { type: 'query';      text: string }
  | { type: 'save';       text: string }
  | { type: 'milestones'             }
  | { type: 'status'                 }
  | { type: 'sessions'               }
  | { type: 'help'                   };

function resolveIntent(request: vscode.ChatRequest): Intent {
  const cmd  = request.command ?? '';
  const text = request.prompt.trim();
  const lo   = text.toLowerCase();

  // Explicit slash commands take priority
  if (cmd === 'query') {
    return { type: 'query', text: text || lo };
  }
  if (cmd === 'save') {
    return { type: 'save', text };
  }
  if (cmd === 'milestones') { return { type: 'milestones' }; }
  if (cmd === 'status')     { return { type: 'status'      }; }
  if (cmd === 'sessions')   { return { type: 'sessions'    }; }

  // Natural language fallback (EN + ES)
  if (/\b(search|find|query|busca|muestra|show|get|dame|look for)\b/.test(lo)) {
    const cleaned = text.replace(/^(search|find|query|busca|muestra|show|get|dame|look for)\s+/i, '');
    return { type: 'query', text: cleaned || text };
  }
  if (/\b(save|create|add|guarda|crea|new node|nuevo nodo|agregar)\b/.test(lo)) {
    return { type: 'save', text };
  }
  if (/\b(milestone|hito|roadmap|progress|progreso|fase|phase|plan)\b/.test(lo)) {
    return { type: 'milestones' };
  }
  if (/\b(status|connected|health|conexi[oó]n|estado|ping)\b/.test(lo)) {
    return { type: 'status' };
  }
  if (/\b(session|sesi[oó]n)\b/.test(lo)) {
    return { type: 'sessions' };
  }

  // No text at all → show help
  if (!text) { return { type: 'help' }; }

  // Default: treat as a graph query
  return { type: 'query', text };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleQuery(
  query: string,
  client: WeaveExtensionClient,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  if (!query) {
    stream.markdown(
      'Please provide a search query.\n\n' +
      'Example: `@openweave /query authentication flow`\n',
    );
    return;
  }

  stream.progress(`Querying graph for "${query}"…`);
  const nodes = await client.queryGraph(query);

  if (token.isCancellationRequested) { return; }

  if (nodes.length === 0) {
    stream.markdown(
      `No nodes found for **"${esc(query)}"**.\n\n` +
      'Try a broader query or save a new node:\n',
    );
    stream.button({ command: 'openweave.saveNode', title: '$(save) Save Node' });
    return;
  }

  stream.markdown(`## Found ${nodes.length} node(s) for "${esc(query)}"\n\n`);
  stream.markdown('| Label | Type | Description |\n|---|---|---|\n');

  for (const node of nodes.slice(0, 20) as WeaveNode[]) {
    const desc = (node.description ?? '').slice(0, 70).replace(/\|/g, '\\|');
    stream.markdown(`| **${esc(node.label)}** | \`${node.type}\` | ${esc(desc)} |\n`);
  }

  if (nodes.length > 20) {
    stream.markdown(`\n> _…and ${nodes.length - 20} more. Explore the full graph in the sidebar._\n`);
  }

  stream.button({
    command: 'openweave.query',
    title: '$(search) Open in Sidebar',
    arguments: [query],
  });
}

async function handleSave(
  text: string,
  client: WeaveExtensionClient,
  stream: vscode.ChatResponseStream,
  request: vscode.ChatRequest,
  token: vscode.CancellationToken,
): Promise<void> {
  stream.progress('Extracting node details with Copilot…');

  let label       = '';
  let type        = 'concept';
  let description = '';

  try {
    // Use the active Copilot model to extract structured fields from free text
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `Extract a knowledge-graph node from the following user message.
Reply ONLY with a JSON object — NO markdown fences, NO extra text:
{"label":"<short label, max 5 words>","type":"<concept|task|milestone|project|decision|issue|file|person|other>","description":"<one clear sentence>"}

User message: ${text}`,
      ),
    ];

    const response = await request.model.sendRequest(messages, {}, token);
    let raw = '';
    for await (const chunk of response.text) { raw += chunk; }

    const parsed = JSON.parse(raw.trim()) as { label?: string; type?: string; description?: string };
    label       = (parsed.label       ?? '').trim();
    type        = (parsed.type        ?? 'concept').trim();
    description = (parsed.description ?? '').trim();
  } catch {
    // LLM extraction failed — fall back to command palette
  }

  if (token.isCancellationRequested) { return; }

  if (!label) {
    stream.markdown(
      "Couldn't auto-extract node details from your message.\n\n" +
      'Use the sidebar command for a guided flow:\n',
    );
    stream.button({ command: 'openweave.saveNode', title: '$(save) Save Node via Sidebar' });
    return;
  }

  stream.progress(`Saving "${label}" (${type})…`);
  const result = await client.saveNode({ label, type, description });

  if (result.success) {
    stream.markdown(
      '✅ **Node saved!**\n\n' +
      '| Field | Value |\n|---|---|\n' +
      `| Label | **${esc(label)}** |\n` +
      `| Type | \`${type}\` |\n` +
      `| Description | ${esc(description)} |\n`,
    );
    stream.button({ command: 'openweave.refresh', title: '$(refresh) Refresh Graph' });
  } else {
    stream.markdown(`❌ **Failed to save node:** ${result.error}\n`);
    stream.button({ command: 'openweave.saveNode', title: '$(save) Try via Sidebar' });
  }
}

async function handleMilestones(
  client: WeaveExtensionClient,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  stream.progress('Loading milestones…');
  const milestones = await client.listMilestones();

  if (token.isCancellationRequested) { return; }

  if (milestones.length === 0) {
    stream.markdown('No milestones found in the knowledge graph.\n');
    return;
  }

  const icon: Record<string, string> = {
    'completed':   '✅',
    'in-progress': '🔄',
    'blocked':     '🚫',
    'not-started': '⭕',
  };

  stream.markdown(`## Milestones (${milestones.length})\n\n`);

  for (const m of milestones) {
    const i = icon[m.status] ?? '⭕';
    stream.markdown(`### ${i} ${esc(m.title)}\n`);
    if (m.phase) { stream.markdown(`> Phase ${m.phase} · \`${m.status}\`\n`); }
    if (m.subtasks?.length) {
      for (const s of m.subtasks) {
        stream.markdown(`- ${icon[s.status] ?? '⭕'} ${esc(s.title)}\n`);
      }
    }
    stream.markdown('\n');
  }

  stream.button({ command: 'openweave.refresh', title: '$(refresh) Refresh' });
}

function handleStatus(client: WeaveExtensionClient, stream: vscode.ChatResponseStream): void {
  const { state, url, message } = client.status;
  const icons: Record<string, string> = {
    connected:    '🟢',
    connecting:   '🟡',
    disconnected: '🔴',
    error:        '🔴',
  };

  stream.markdown(
    '## OpenWeave Status\n\n' +
    `**State:** ${icons[state] ?? '⚪'} \`${state}\`\n\n` +
    `**Server:** \`${url || '(none)'}\`\n` +
    (message ? `\n**Message:** ${esc(message)}\n` : ''),
  );

  if (state !== 'connected') {
    stream.button({ command: 'openweave.connect',     title: '$(plug) Connect'         });
    stream.button({ command: 'openweave.startServer', title: '$(play) Start WeaveLink' });
  }
}

async function handleSessions(
  client: WeaveExtensionClient,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  stream.progress('Loading sessions…');
  const sessions = await client.listSessions();

  if (token.isCancellationRequested) { return; }

  if (sessions.length === 0) {
    stream.markdown('No active sessions found.\n');
    return;
  }

  stream.markdown(`## Active Sessions (${sessions.length})\n\n`);
  stream.markdown('| Name | Provider | Nodes | Started |\n|---|---|---|---|\n');
  for (const s of sessions) {
    const name    = esc(s.name ?? s.id);
    const started = new Date(s.startedAt).toLocaleString();
    stream.markdown(`| ${name} | \`${s.provider}\` | ${s.nodeCount} | ${started} |\n`);
  }
}

function handleHelp(stream: vscode.ChatResponseStream): void {
  stream.markdown(
    '## OpenWeave Chat Participant\n\n' +
    'Use `@openweave` in Copilot Chat to interact with your WeaveGraph knowledge base.\n\n' +
    '### Slash commands\n\n' +
    '| Command | Description | Example |\n|---|---|---|\n' +
    '| `/query` | Search the graph | `@openweave /query authentication flow` |\n' +
    '| `/save` | Save a new node | `@openweave /save the login bug causes a 401 on mobile` |\n' +
    '| `/milestones` | Show roadmap progress | `@openweave /milestones` |\n' +
    '| `/sessions` | List active sessions | `@openweave /sessions` |\n' +
    '| `/status` | Connection status | `@openweave /status` |\n\n' +
    '### Natural language\n\n' +
    'You can also skip the slash command:\n' +
    '- `@openweave find all task nodes related to payments`\n' +
    '- `@openweave guarda un nodo sobre el bug de autenticación`\n' +
    '- `@openweave show milestones for phase 2`\n',
  );
}

// ---------------------------------------------------------------------------

function esc(s: string): string {
  return String(s ?? '').replace(/[|*_`\\]/g, (c) => `\\${c}`);
}
