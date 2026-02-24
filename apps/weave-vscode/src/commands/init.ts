import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';

/**
 * openweave.init — initialises a .weave/ project in the current workspace.
 */
export async function initCommand(client: WeaveExtensionClient): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('OpenWeave: No workspace folder open. Please open a folder first.');
    return;
  }

  const projectName = await vscode.window.showInputBox({
    title: 'OpenWeave: Init Project',
    prompt: 'Project name',
    value: folder.name,
    validateInput: (v) => (v.trim() ? undefined : 'Project name cannot be empty'),
  });
  if (!projectName) { return; }

  const description = await vscode.window.showInputBox({
    title: 'OpenWeave: Init Project',
    prompt: 'Short project description (optional)',
  });

  if (client.status.state !== 'connected') {
    vscode.window.showInformationMessage(
      'OpenWeave: Not connected to WeaveLink. Please connect first via "OpenWeave: Connect Server".',
      'Connect',
    ).then((action) => {
      if (action === 'Connect') { vscode.commands.executeCommand('openweave.connect'); }
    });
    return;
  }

  const result = await client.saveNode({
    label: projectName,
    type: 'project',
    description: description ?? '',
    metadata: { rootPath: folder.uri.fsPath, initialised: true },
  });

  if (result.success) {
    vscode.window.showInformationMessage(`OpenWeave: Project "${projectName}" initialised ✓`);
    vscode.commands.executeCommand('openweave.refresh');
  } else {
    vscode.window.showErrorMessage(`OpenWeave: Init failed — ${result.error}`);
  }
}
