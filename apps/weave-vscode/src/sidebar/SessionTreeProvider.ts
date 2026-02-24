import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { SessionInfo } from '../types';

// ---------------------------------------------------------------------------
// Tree item
// ---------------------------------------------------------------------------

class SessionItem extends vscode.TreeItem {
  constructor(public readonly session: SessionInfo) {
    super(session.name ?? session.id, vscode.TreeItemCollapsibleState.None);

    this.description = `${session.provider} · ${session.nodeCount}n`;
    this.tooltip = [
      `ID: ${session.id}`,
      `Provider: ${session.provider}`,
      `Nodes: ${session.nodeCount}`,
      `Started: ${new Date(session.startedAt).toLocaleString()}`,
      session.lastActiveAt ? `Last active: ${new Date(session.lastActiveAt).toLocaleString()}` : '',
    ].filter(Boolean).join('\n');

    this.iconPath = new vscode.ThemeIcon(
      'database',
      new vscode.ThemeColor('charts.blue'),
    );
    this.contextValue = 'sessionItem';
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SessionTreeProvider
  implements vscode.TreeDataProvider<SessionItem>, vscode.Disposable {

  private readonly _emitter = new vscode.EventEmitter<SessionItem | undefined | void>();
  readonly onDidChangeTreeData = this._emitter.event;

  private _sessions: SessionInfo[] = [];

  constructor(private readonly client: WeaveExtensionClient) {
    // Refresh whenever connection state changes or graph updates arrive
    client.onStatusChange.on(() => this.refresh());
    client.onGraphUpdate.on(() => this.refresh());
  }

  dispose(): void { this._emitter.dispose(); }

  refresh(): void {
    if (this.client.status.state === 'connected') {
      this._load();
    } else {
      this._sessions = [];
      this._emitter.fire();
    }
  }

  getTreeItem(element: SessionItem): vscode.TreeItem { return element; }

  async getChildren(): Promise<SessionItem[]> {
    if (this.client.status.state !== 'connected') {
      return [];
    }
    if (this._sessions.length === 0) {
      await this._load();
    }
    return this._sessions.map((s) => new SessionItem(s));
  }

  // private ------------------------------------------------------------------

  private async _load(): Promise<void> {
    this._sessions = await this.client.listSessions();
    this._emitter.fire();
  }
}
