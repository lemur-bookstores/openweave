import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { MilestoneItem, MilestoneStatus, SubtaskItem } from '../types';

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

type MilestoneTreeNode = MilestoneTreeItem | SubtaskTreeItem;

class MilestoneTreeItem extends vscode.TreeItem {
  constructor(public readonly milestone: MilestoneItem) {
    super(
      milestone.title,
      milestone.subtasks?.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.description = milestone.phase ? `Phase ${milestone.phase}` : undefined;
    this.tooltip = `${milestone.title}\nStatus: ${milestone.status}`;
    this.iconPath = milestoneIcon(milestone.status);
    this.contextValue = 'milestoneItem';
  }
}

class SubtaskTreeItem extends vscode.TreeItem {
  constructor(public readonly subtask: SubtaskItem) {
    super(subtask.title, vscode.TreeItemCollapsibleState.None);
    this.iconPath = milestoneIcon(subtask.status);
    this.contextValue = 'subtaskItem';
  }
}

function milestoneIcon(status: MilestoneStatus): vscode.ThemeIcon {
  switch (status) {
    case 'completed':   return new vscode.ThemeIcon('pass',         new vscode.ThemeColor('testing.iconPassed'));
    case 'in-progress': return new vscode.ThemeIcon('sync~spin',    new vscode.ThemeColor('progressBar.background'));
    case 'blocked':     return new vscode.ThemeIcon('error',        new vscode.ThemeColor('testing.iconFailed'));
    default:            return new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('testing.iconQueued'));
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class MilestoneTreeProvider
  implements vscode.TreeDataProvider<MilestoneTreeNode>, vscode.Disposable {

  private readonly _emitter = new vscode.EventEmitter<MilestoneTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._emitter.event;

  private _milestones: MilestoneItem[] = [];

  constructor(private readonly client: WeaveExtensionClient) {
    client.onStatusChange.on(() => this.refresh());
    // Only refresh milestones on graph update if they haven't been loaded yet
    client.onGraphUpdate.on(() => {
      if (this._milestones.length === 0) { this.refresh(); }
    });
  }

  dispose(): void { this._emitter.dispose(); }

  refresh(): void {
    if (this.client.status.state === 'connected') {
      this._load();
    } else {
      this._milestones = [];
      this._emitter.fire();
    }
  }

  getTreeItem(element: MilestoneTreeNode): vscode.TreeItem { return element; }

  async getChildren(element?: MilestoneTreeNode): Promise<MilestoneTreeNode[]> {
    if (this.client.status.state !== 'connected') { return []; }

    if (!element) {
      // Root: load milestones
      if (this._milestones.length === 0) { await this._load(); }
      return this._milestones.map((m) => new MilestoneTreeItem(m));
    }

    if (element instanceof MilestoneTreeItem && element.milestone.subtasks?.length) {
      return element.milestone.subtasks.map((s) => new SubtaskTreeItem(s));
    }

    return [];
  }

  // private ------------------------------------------------------------------

  private async _load(): Promise<void> {
    this._milestones = await this.client.listMilestones();
    this._emitter.fire();
  }
}
