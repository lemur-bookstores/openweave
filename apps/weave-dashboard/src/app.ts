/**
 * DashboardApp — M10
 *
 * Wires all modules together: client, graph layout, renderer, milestone board,
 * error registry, and session diff. Manages view switching and DOM updates.
 *
 * Imported by main.ts and instantiated once on DOMContentLoaded.
 */

import { WeaveDashboardClient } from './client';
import { GraphLayoutEngine } from './graph-layout';
import { GraphRenderer } from './graph-renderer';
import { MilestoneBoard } from './milestone-board';
import { ErrorRegistry } from './error-registry';
import { SessionDiff } from './session-diff';
import type { GraphSnapshot, Milestone, GraphLayout } from './types';

// ──────────────────────────────────────────────────────────────────────────────

export class DashboardApp {
  private client: WeaveDashboardClient;
  private layoutEngine: GraphLayoutEngine;
  private renderer: GraphRenderer | null = null;

  private snapshot: GraphSnapshot | null = null;
  private milestones: Milestone[] = [];
  private currentChatId = 'default';
  private layout: GraphLayout | null = null;

  constructor() {
    const serverUrl = (document.getElementById('server-url-input') as HTMLInputElement).value;
    this.client = new WeaveDashboardClient(serverUrl);
    this.layoutEngine = new GraphLayoutEngine({ width: 1200, height: 700, iterations: 120 });
  }

  // ── Initialisation ─────────────────────────────────────────────────────

  init(): void {
    this.bindNavigation();
    this.bindControls();
    this.initRenderer();
    this.connect();
  }

  private initRenderer(): void {
    const svgEl = document.getElementById('graph-svg') as SVGSVGElement | null;
    const tipEl = document.getElementById('tooltip') as HTMLElement | null;
    if (svgEl && tipEl) {
      this.renderer = new GraphRenderer(svgEl, tipEl);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  private bindNavigation(): void {
    document.querySelectorAll('nav a[data-view]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const view = (link as HTMLElement).dataset['view'];
        if (view) this.switchView(view);
      });
    });
  }

  private switchView(view: string): void {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));

    const viewEl = document.getElementById(`view-${view}`);
    const navEl = document.querySelector(`nav a[data-view="${view}"]`);
    viewEl?.classList.add('active');
    navEl?.classList.add('active');

    // Render on demand
    if (view === 'milestones') this.renderMilestones();
    if (view === 'errors') this.renderErrors();
    if (view === 'diff') this.populateDiffSelects();
  }

  // ── Connect + data loading ──────────────────────────────────────────────

  private bindControls(): void {
    document.getElementById('connect-btn')?.addEventListener('click', () => this.connect());
    document.getElementById('refresh-graph')?.addEventListener('click', () => this.loadGraph());
    document.getElementById('node-type-filter')?.addEventListener('change', () => {
      if (this.layout) this.applyGraphFilter();
    });

    document.getElementById('error-search')?.addEventListener('input', () => this.renderErrors());
    document.getElementById('show-corrected')?.addEventListener('change', () => this.renderErrors());

    document.getElementById('diff-run-btn')?.addEventListener('click', () => this.runDiff());
  }

  private async connect(): Promise<void> {
    const input = document.getElementById('server-url-input') as HTMLInputElement;
    this.client.setBaseUrl(input.value);

    const statusEl = document.getElementById('connection-status')!;
    statusEl.textContent = 'connecting…';
    statusEl.className = '';

    try {
      const health = await this.client.getHealth();
      statusEl.textContent = `connected · v${health.version}`;
      statusEl.className = 'connected';
      await this.loadGraph();
    } catch {
      statusEl.textContent = 'connection failed';
      statusEl.className = 'error';
    }
  }

  private async loadGraph(): Promise<void> {
    try {
      this.snapshot = await this.client.getSnapshot(this.currentChatId);
      this.layout = this.layoutEngine.compute(this.snapshot);
      this.applyGraphFilter();
      this.extractMilestonesFromSnapshot();
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  }

  private applyGraphFilter(): void {
    if (!this.layout || !this.renderer) return;
    const filter = (document.getElementById('node-type-filter') as HTMLSelectElement)?.value;
    this.renderer.render(this.layout, filter || undefined);
  }

  // ── Milestones ────────────────────────────────────────────────────────

  private extractMilestonesFromSnapshot(): void {
    if (!this.snapshot) return;
    // Convert MILESTONE nodes to minimal Milestone objects for the board
    this.milestones = Object.values(this.snapshot.nodes)
      .filter(n => n.type === 'MILESTONE')
      .map(n => ({
        id: n.id,
        name: n.label,
        status: (n.metadata?.['status'] as Milestone['status']) ?? 'NOT_STARTED',
        priority: (n.metadata?.['priority'] as Milestone['priority']) ?? 'MEDIUM',
        subTasks: [],
        estimatedHours: (n.metadata?.['estimatedHours'] as number) ?? 0,
      }));
  }

  private renderMilestones(): void {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    if (this.milestones.length === 0) {
      board.innerHTML = '<div class="empty"><p>No milestones found.<br/>Connect to a WeaveLink session with milestone data.</p></div>';
      return;
    }

    const columns = MilestoneBoard.toColumns(this.milestones);
    board.innerHTML = columns
      .map(col => {
        const cards = MilestoneBoard.sortByPriority(col.milestones)
          .map(m => `
            <div class="kanban-card">
              <h4>${m.name}</h4>
              <div class="kanban-meta">${m.completedSubTasks}/${m.totalSubTasks} tasks · ${m.estimatedHours}h est.</div>
              <div class="kanban-progress">
                <div class="kanban-progress-bar" style="width:${m.progressPct}%"></div>
              </div>
            </div>`)
          .join('');

        return `
          <div class="kanban-col" data-status="${col.status}">
            <div class="kanban-col-title">${col.label} <span style="color:var(--muted)">(${col.milestones.length})</span></div>
            ${cards || '<div class="kanban-meta" style="padding-top:8px">Empty</div>'}
          </div>`;
      })
      .join('');
  }

  // ── Error Registry ─────────────────────────────────────────────────────

  private renderErrors(): void {
    const tbody = document.getElementById('error-tbody');
    if (!tbody) return;

    if (!this.snapshot) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--muted); padding:32px">Connect to a session to browse errors.</td></tr>';
      return;
    }

    const showCorrected = (document.getElementById('show-corrected') as HTMLInputElement)?.checked ?? false;
    const query = (document.getElementById('error-search') as HTMLInputElement)?.value ?? '';
    const all = ErrorRegistry.build(this.snapshot);
    const filtered = ErrorRegistry.filter(all, { showCorrected, searchQuery: query });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--muted); padding:32px">No errors match this filter.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(e => `
      <tr>
        <td>${e.node.label}</td>
        <td>${e.node.frequency}</td>
        <td><span class="badge ${e.isCorrected ? 'badge-CORRECTION' : 'badge-ERROR'}">${e.isCorrected ? 'Corrected' : 'Open'}</span></td>
        <td style="color:var(--muted)">${e.correctedBy ?? '—'}</td>
      </tr>`).join('');
  }

  // ── Session Diff ──────────────────────────────────────────────────────

  private async populateDiffSelects(): Promise<void> {
    const sessions = await this.client.listSessions();
    const selA = document.getElementById('diff-session-a') as HTMLSelectElement;
    const selB = document.getElementById('diff-session-b') as HTMLSelectElement;
    if (!selA || !selB) return;

    const opts = sessions.map(s =>
      `<option value="${s.chatId}">${s.chatId} (${new Date(s.updatedAt).toLocaleDateString()})</option>`
    ).join('');

    selA.innerHTML = `<option value="">— select session —</option>${opts}`;
    selB.innerHTML = `<option value="">— select session —</option>${opts}`;
  }

  private async runDiff(): Promise<void> {
    const selA = (document.getElementById('diff-session-a') as HTMLSelectElement).value;
    const selB = (document.getElementById('diff-session-b') as HTMLSelectElement).value;
    const output = document.getElementById('diff-output');
    if (!output || !selA || !selB) return;

    output.innerHTML = '<p style="color:var(--muted)">Loading…</p>';

    try {
      const [snapA, snapB] = await Promise.all([
        this.client.getSnapshot(selA),
        this.client.getSnapshot(selB),
      ]);

      const diff = SessionDiff.diff(selA, snapA, selB, snapB);
      const summary = SessionDiff.summarize(diff);

      output.innerHTML = `
        <p style="margin-bottom:12px; color:var(--muted); font-size:12px">${summary}</p>
        <div class="diff-grid">
          <div class="diff-section added">
            <h3>Added nodes (${diff.addedNodes.length})</h3>
            ${diff.addedNodes.map(n => `<div class="diff-item diff-added">+ ${n.label} <span style="color:var(--muted)">[${n.type}]</span></div>`).join('') || '<div class="diff-item" style="color:var(--muted)">none</div>'}
          </div>
          <div class="diff-section removed">
            <h3>Removed nodes (${diff.removedNodes.length})</h3>
            ${diff.removedNodes.map(n => `<div class="diff-item diff-removed">- ${n.label} <span style="color:var(--muted)">[${n.type}]</span></div>`).join('') || '<div class="diff-item" style="color:var(--muted)">none</div>'}
          </div>
          <div class="diff-section changed">
            <h3>Changed nodes (${diff.changedNodes.length})</h3>
            ${diff.changedNodes.map(n => `<div class="diff-item diff-changed">~ ${n.label}<br/><small style="color:var(--muted)">${n.changes.join('; ')}</small></div>`).join('') || '<div class="diff-item" style="color:var(--muted)">none</div>'}
          </div>
        </div>`;
    } catch (err) {
      output.innerHTML = `<p style="color:var(--fail)">Error: ${err instanceof Error ? err.message : String(err)}</p>`;
    }
  }
}
