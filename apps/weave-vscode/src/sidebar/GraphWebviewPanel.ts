import * as vscode from 'vscode';
import { WeaveExtensionClient } from '../client/WeaveExtensionClient';
import { ExtToWebviewMessage, GraphSnapshot } from '../types';

/**
 * GraphWebviewPanel — implements WebviewViewProvider so it slots into the
 * "openweave.graph" view declared in package.json.
 *
 * Renders a D3 v7 force-directed graph loaded from CDN.
 * Falls back gracefully when offline.
 */
export class GraphWebviewPanel
  implements vscode.WebviewViewProvider, vscode.Disposable {

  private _view?: vscode.WebviewView;
  private _lastSnapshot?: GraphSnapshot;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: WeaveExtensionClient,
  ) {
    _client.onGraphUpdate.on((snapshot) => {
      this._lastSnapshot = snapshot;
      this._sendMessage({ type: 'graphUpdate', snapshot });
    });
  }

  dispose(): void { /* WebviewView is managed by VS Code */ }

  // ---- WebviewViewProvider -------------------------------------------------

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      // Allow loading resources from CDN (no local resource roots needed)
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((msg: { type: string; nodeId?: string }) => {
      if (msg.type === 'ready' && this._lastSnapshot) {
        this._sendMessage({ type: 'graphUpdate', snapshot: this._lastSnapshot });
      }
      if (msg.type === 'nodeClicked' && msg.nodeId) {
        vscode.commands.executeCommand('openweave.query', msg.nodeId);
      }
    });

    // Send theme info immediately
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
      || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
    this._sendMessage({ type: 'theme', isDark });
  }

  // ---- Helpers -------------------------------------------------------------

  private _sendMessage(msg: ExtToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const csp = webview.cspSource;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'unsafe-inline' https://cdn.jsdelivr.net ${csp};
                 style-src 'unsafe-inline' ${csp};
                 connect-src 'none';
                 img-src data: ${csp};"/>
  <title>WeaveGraph</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); overflow: hidden; }
    #app { width: 100vw; height: 100vh; }
    svg { display: block; width: 100%; height: 100%; }
    .node circle { cursor: pointer; stroke-width: 1.5px; }
    .node text { font-size: 11px; pointer-events: none; }
    .link { stroke-opacity: 0.5; stroke-width: 1.2px; }
    #empty { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; opacity: 0.5; font-size: 13px; }
    #loading { display: none; }
  </style>
</head>
<body>
<div id="app">
  <svg id="graph-svg"></svg>
  <div id="empty">
    <div style="font-size:28px">⬡</div>
    <div>No graph data yet.</div>
    <div style="font-size:11px;margin-top:4px">Connect to WeaveLink to visualize the knowledge graph.</div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  let isDark = false;
  let simulation = null;
  let currentData = { nodes: [], edges: [] };

  const svg = d3.select('#graph-svg');
  const emptyDiv = document.getElementById('empty');

  // colours
  const nodeColours = {
    default:   '#4E9DE0',
    task:      '#79C99E',
    concept:   '#F5A623',
    milestone: '#A78BFA',
    session:   '#F87171',
  };

  function getNodeColor(type) {
    return nodeColours[type?.toLowerCase()] ?? nodeColours.default;
  }

  function render(data) {
    currentData = data;
    emptyDiv.style.display = (data.nodes.length === 0) ? 'flex' : 'none';
    if (data.nodes.length === 0) { svg.selectAll('*').remove(); return; }

    svg.selectAll('*').remove();

    const width  = svg.node().clientWidth  || 400;
    const height = svg.node().clientHeight || 400;

    const g = svg.append('g');

    // zoom
    svg.call(d3.zoom().scaleExtent([0.1, 6]).on('zoom', (e) => g.attr('transform', e.transform)));

    // arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#888');

    const links = g.append('g').selectAll('line')
      .data(data.edges)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', isDark ? '#555' : '#bbb')
      .attr('marker-end', 'url(#arrow)');

    const nodes = g.append('g').selectAll('.node')
      .data(data.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragStart)
        .on('drag', dragged)
        .on('end', dragEnd))
      .on('click', (e, d) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'nodeClicked', nodeId: d.id });
      });

    nodes.append('circle')
      .attr('r', 12)
      .attr('fill', (d) => getNodeColor(d.type))
      .attr('stroke', isDark ? '#aaa' : '#666');

    nodes.append('text')
      .attr('dy', 22).attr('text-anchor', 'middle')
      .attr('fill', isDark ? '#ccc' : '#333')
      .text((d) => d.label.length > 14 ? d.label.slice(0,12) + '…' : d.label);

    if (simulation) { simulation.stop(); }
    simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        links
          .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
        nodes.attr('transform', (d) => 'translate(' + d.x + ',' + d.y + ')');
      });

    function dragStart(e, d) { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(e, d)    { d.fx = e.x; d.fy = e.y; }
    function dragEnd(e, d)    { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }
  }

  // ---- Message bridge ----
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'graphUpdate' && msg.snapshot) {
      render({ nodes: msg.snapshot.nodes || [], edges: msg.snapshot.edges || [] });
    }
    if (msg.type === 'theme') {
      isDark = msg.isDark;
      if (currentData.nodes.length > 0) { render(currentData); }
    }
  });

  // Tell extension we're ready
  vscode.postMessage({ type: 'ready' });
}());
</script>
</body>
</html>`;
  }
}
