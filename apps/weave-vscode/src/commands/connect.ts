import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';

/**
 * openweave.connect — prompts for server URL + API key, persists them in
 * VS Code settings, then (re)connects the client.
 */
export async function connectCommand(client: WeaveExtensionClient): Promise<void> {
  const config = vscode.workspace.getConfiguration('openweave');
  const currentUrl = config.get<string>('serverUrl', 'http://localhost:3000');
  const currentKey = config.get<string>('apiKey', '');

  // 1. Server URL
  const url = await vscode.window.showInputBox({
    title: 'OpenWeave: Connect Server (1/2)',
    prompt: 'WeaveLink server URL',
    value: currentUrl,
    placeHolder: 'http://localhost:3000',
    validateInput: (v) => {
      try { new URL(v); return undefined; } catch { return 'Invalid URL'; }
    },
  });
  if (!url) { return; }

  // 2. API Key (optional)
  const apiKey = await vscode.window.showInputBox({
    title: 'OpenWeave: Connect Server (2/2)',
    prompt: 'API Key (leave empty if authentication is disabled)',
    value: currentKey,
    password: true,
  });
  if (apiKey === undefined) { return; } // Escape pressed

  // Persist settings
  await config.update('serverUrl', url, vscode.ConfigurationTarget.Workspace);
  if (apiKey !== currentKey) {
    await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Workspace);
  }

  // Reconnect
  client.disconnect();
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Connecting to WeaveLink…', cancellable: false },
    () => client.connect(),
  );

  if (client.status.state === 'connected') {
    vscode.window.showInformationMessage(`OpenWeave: Connected to ${url} ✓`);
  } else {
    vscode.window.showErrorMessage(
      `OpenWeave: Could not connect — ${client.status.message ?? 'unknown error'}`,
    );
  }
}
