import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';

const NODE_TYPES = [
  'concept', 'task', 'milestone', 'project', 'decision',
  'issue', 'session', 'file', 'person', 'other',
];

/**
 * openweave.saveNode — multi-step QuickPick/InputBox flow to create a node.
 */
export async function saveNodeCommand(client: WeaveExtensionClient): Promise<void> {
  if (client.status.state !== 'connected') {
    vscode.window.showWarningMessage('OpenWeave: Not connected. Use "OpenWeave: Connect Server" first.');
    return;
  }

  // 1. Label
  const label = await vscode.window.showInputBox({
    title: 'OpenWeave: Save Node (1/3)',
    prompt: 'Node label',
    placeHolder: 'e.g. "Authentication flow", "Login bug", "v2 Milestone"',
    validateInput: (v) => (v.trim() ? undefined : 'Label cannot be empty'),
  });
  if (!label) { return; }

  // 2. Type
  const typePick = await vscode.window.showQuickPick(
    NODE_TYPES.map((t) => ({ label: t })),
    {
      title: 'OpenWeave: Save Node (2/3)',
      placeHolder: 'Select node type',
    },
  );
  if (!typePick) { return; }

  // 3. Description
  const description = await vscode.window.showInputBox({
    title: 'OpenWeave: Save Node (3/3)',
    prompt: 'Brief description (optional)',
    placeHolder: 'What does this node represent?',
  });
  if (description === undefined) { return; } // user pressed Escape

  const result = await client.saveNode({
    label: label.trim(),
    type: typePick.label,
    description: description.trim(),
  });

  if (result.success) {
    vscode.window.showInformationMessage(`OpenWeave: Node "${label}" saved ✓`);
    vscode.commands.executeCommand('openweave.refresh');
  } else {
    vscode.window.showErrorMessage(`OpenWeave: Save failed — ${result.error}`);
  }
}
