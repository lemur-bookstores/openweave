import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { WeaveNode } from '../types';

/**
 * openweave.query — opens an input box, queries the graph, and shows results
 * in a QuickPick with label + type + description.
 *
 * Accepts an optional pre-filled query string (used when called from the
 * graph webview on node click).
 */
export async function queryCommand(
  client: WeaveExtensionClient,
  prefill?: string,
): Promise<void> {
  if (client.status.state !== 'connected') {
    vscode.window.showWarningMessage('OpenWeave: Not connected. Use "OpenWeave: Connect Server" first.');
    return;
  }

  const query = await vscode.window.showInputBox({
    title: 'OpenWeave: Query Graph',
    prompt: 'Enter a search query (label, type, keyword…)',
    value: prefill ?? '',
    placeHolder: 'e.g. "auth milestone", "type:task", "login flow"',
  });
  if (!query) { return; }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Querying graph…', cancellable: false },
    async () => {
      const nodes = await client.queryGraph(query);

      if (nodes.length === 0) {
        vscode.window.showInformationMessage(`OpenWeave: No results for "${query}"`);
        return;
      }

      const picked = await vscode.window.showQuickPick(
        nodes.map((n: WeaveNode) => ({
          label: n.label,
          description: n.type,
          detail: n.description,
          node: n,
        })),
        {
          title: `OpenWeave: ${nodes.length} result(s) for "${query}"`,
          matchOnDescription: true,
          matchOnDetail: true,
          placeHolder: 'Select a node to view details',
        },
      );

      if (picked) {
        showNodeDetail(picked.node);
      }
    },
  );
}

// ---------------------------------------------------------------------------

function showNodeDetail(node: WeaveNode): void {
  const panel = vscode.window.createWebviewPanel(
    'openweave.nodeDetail',
    `Node: ${node.label}`,
    vscode.ViewColumn.Two,
    { enableScripts: false },
  );

  const meta = node.metadata
    ? JSON.stringify(node.metadata, null, 2)
    : '(none)';

  panel.webview.html = /* html */`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"/>
<style>body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px}
h1{font-size:1.2em;margin-bottom:8px} table{border-collapse:collapse;width:100%}
td{padding:4px 8px;vertical-align:top} td:first-child{font-weight:600;width:120px;opacity:.7}
pre{background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:4px;overflow:auto}</style>
</head><body>
<h1>${esc(node.label)}</h1>
<table>
  <tr><td>ID</td><td><code>${esc(node.id)}</code></td></tr>
  <tr><td>Type</td><td>${esc(node.type)}</td></tr>
  <tr><td>Description</td><td>${esc(node.description ?? '—')}</td></tr>
  <tr><td>Created</td><td>${esc(node.createdAt ?? '—')}</td></tr>
  <tr><td>Updated</td><td>${esc(node.updatedAt ?? '—')}</td></tr>
  <tr><td>Metadata</td><td><pre>${esc(meta)}</pre></td></tr>
</table>
</body></html>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
