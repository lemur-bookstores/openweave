import * as vscode from 'vscode';

import { WeaveExtensionClient }    from './client/WeaveExtensionClient';
import { WeaveStatusBar }          from './status-bar/WeaveStatusBar';
import { SessionTreeProvider }     from './sidebar/SessionTreeProvider';
import { MilestoneTreeProvider }   from './sidebar/MilestoneTreeProvider';
import { GraphWebviewPanel }       from './sidebar/GraphWebviewPanel';
import { initCommand }             from './commands/init';
import { queryCommand }            from './commands/query';
import { saveNodeCommand }         from './commands/saveNode';
import { connectCommand }          from './commands/connect';
import { registerChatParticipant } from './chat/WeaveChatParticipant';

// ---------------------------------------------------------------------------
// activate — called when a workspace with .weave/ is opened (see package.json)
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ---- Core services -------------------------------------------------------
  const client = new WeaveExtensionClient();

  // ---- Status bar ----------------------------------------------------------
  const statusBar = new WeaveStatusBar(client);

  // ---- Sidebar providers ---------------------------------------------------
  const sessionProvider   = new SessionTreeProvider(client);
  const milestoneProvider = new MilestoneTreeProvider(client);
  const graphProvider      = new GraphWebviewPanel(context.extensionUri, client);

  // ---- Register views & WebviewViewProvider --------------------------------
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('openweave.sessions',   sessionProvider),
    vscode.window.registerTreeDataProvider('openweave.milestones', milestoneProvider),
    vscode.window.registerWebviewViewProvider('openweave.graph',    graphProvider),
  );

  // ---- Commands ------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('openweave.init',    ()          => initCommand(client)),
    vscode.commands.registerCommand('openweave.query',   (prefill?)  => queryCommand(client, prefill as string | undefined)),
    vscode.commands.registerCommand('openweave.saveNode',()          => saveNodeCommand(client)),
    vscode.commands.registerCommand('openweave.connect', ()          => connectCommand(client)),
    vscode.commands.registerCommand('openweave.refresh', ()          => {
      sessionProvider.refresh();
      milestoneProvider.refresh();
    }),
    vscode.commands.registerCommand('openweave.startServer', ()      => startServer(context, client)),
    vscode.commands.registerCommand('openweave.stopServer',  ()      => stopServer()),
  );

  // ---- Chat Participant (@openweave in Copilot Chat) -----------------------
  // Gracefully no-ops when GitHub Copilot Chat extension is not installed.
  context.subscriptions.push(registerChatParticipant(context, client));

  // ---- Disposables ---------------------------------------------------------
  context.subscriptions.push(statusBar, client, sessionProvider, milestoneProvider);

  // ---- Auto-connect --------------------------------------------------------
  const cfg = vscode.workspace.getConfiguration('openweave');
  if (cfg.get<boolean>('autoStart', false)) {
    // fire-and-forget; status bar will reflect the outcome
    client.connect().catch(() => { /* surfaced via status bar */ });
  }

  console.log('[OpenWeave] Extension activated');
}

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

export function deactivate(): void {
  stopServer();
}

// ---------------------------------------------------------------------------
// Server lifecycle helpers (weave-link process)
// ---------------------------------------------------------------------------

let _serverTerminal: vscode.Terminal | undefined;

function startServer(context: vscode.ExtensionContext, client: WeaveExtensionClient): void {
  if (_serverTerminal) {
    _serverTerminal.show();
    return;
  }

  const cfg = vscode.workspace.getConfiguration('openweave');
  const port = new URL(cfg.get<string>('serverUrl', 'http://localhost:3000')).port || '3000';
  const provider = cfg.get<string>('provider', 'sqlite');

  _serverTerminal = vscode.window.createTerminal({
    name: 'WeaveLink',
    shellPath: undefined, // uses default shell
  });
  _serverTerminal.sendText(`npx weave-link start --port ${port} --provider ${provider}`);
  _serverTerminal.show();

  // Auto-connect after a brief delay
  setTimeout(() => client.connect().catch(() => undefined), 2000);

  vscode.window.onDidCloseTerminal((t) => {
    if (t === _serverTerminal) { _serverTerminal = undefined; }
  });
}

function stopServer(): void {
  if (_serverTerminal) {
    _serverTerminal.sendText('exit');
    _serverTerminal.dispose();
    _serverTerminal = undefined;
  }
}
