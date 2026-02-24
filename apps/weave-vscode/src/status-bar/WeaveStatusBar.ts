import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { ServerStatus } from '../types';

/**
 * WeaveStatusBar — shows connection state + node count in the status bar.
 * Lives in the right section (priority -1000) for a non-intrusive presence.
 */
export class WeaveStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private _nodeCount = 0;

  constructor(private readonly client: WeaveExtensionClient) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000,
    );
    this._item.command = 'openweave.connect';
    this._item.name = 'OpenWeave';

    // Listen for status changes
    client.onStatusChange.on((status) => this._onStatus(status));
    client.onGraphUpdate.on((snapshot) => {
      this._nodeCount = snapshot.nodeCount;
      this._render();
    });

    this._render();
    this._item.show();
  }

  dispose(): void {
    this._item.dispose();
  }

  // ---------------------------------------------------------------------------

  private _onStatus(status: ServerStatus): void {
    if (status.state !== 'connected') { this._nodeCount = 0; }
    this._render();
  }

  private _render(): void {
    const { state } = this.client.status;

    switch (state) {
      case 'connected':
        this._item.text = `$(radio-tower) Weave $(dot) ${this._nodeCount}n`;
        this._item.tooltip = `OpenWeave: Connected to ${this.client.status.url}\nNodes: ${this._nodeCount}\nClick to reconnect`;
        this._item.backgroundColor = undefined;
        this._item.color = new vscode.ThemeColor('statusBarItem.prominentBackground');
        break;

      case 'connecting':
        this._item.text = '$(loading~spin) Weave…';
        this._item.tooltip = `OpenWeave: Connecting to ${this.client.status.url}`;
        this._item.backgroundColor = undefined;
        this._item.color = undefined;
        break;

      case 'error':
        this._item.text = '$(error) Weave';
        this._item.tooltip = `OpenWeave: Error — ${this.client.status.message}\nClick to reconnect`;
        this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this._item.color = undefined;
        break;

      default: // disconnected
        this._item.text = '$(circle-slash) Weave';
        this._item.tooltip = 'OpenWeave: Disconnected. Click to connect.';
        this._item.backgroundColor = undefined;
        this._item.color = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }
}
