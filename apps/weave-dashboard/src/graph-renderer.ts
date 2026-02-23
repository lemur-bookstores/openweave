/**
 * GraphRenderer — M10
 *
 * D3-powered SVG renderer for the WeaveGraph knowledge graph.
 * Applies force simulation on top of the pre-computed GraphLayoutEngine
 * positions, then renders coloured nodes + labelled edges.
 *
 * Must only be imported in browser contexts since it depends on DOM + D3.
 */

import * as d3 from 'd3';
import type { GraphLayout, LayoutNode, LayoutEdge } from './types';

// ──────────────────────────────────────────────────────────────────────────────

const NODE_RADIUS: Record<string, number> = {
  ERROR:       12,
  CORRECTION:  10,
  MILESTONE:   10,
  DECISION:    9,
  CONCEPT:     8,
  CODE_ENTITY: 7,
};

const NODE_COLOR: Record<string, string> = {
  CONCEPT:     '#58a6ff',
  DECISION:    '#bc8cff',
  MILESTONE:   '#3fb950',
  ERROR:       '#f85149',
  CORRECTION:  '#f0883e',
  CODE_ENTITY: '#79c0ff',
};

const EDGE_COLOR: Record<string, string> = {
  CORRECTS:   '#3fb950',
  CAUSES:     '#f85149',
  BLOCKS:     '#d29922',
  RELATES:    '#30363d',
  IMPLEMENTS: '#58a6ff',
  DEPENDS_ON: '#bc8cff',
};

// ──────────────────────────────────────────────────────────────────────────────

export class GraphRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container: d3.Selection<SVGGElement, unknown, null, undefined>;
  private tooltip: d3.Selection<HTMLElement, unknown, null, undefined>;
  private simulation: d3.Simulation<LayoutNode, LayoutEdge> | null = null;

  constructor(svgEl: SVGSVGElement, tooltipEl: HTMLElement) {
    this.svg = d3.select(svgEl);
    this.tooltip = d3.select(tooltipEl);

    // Zoom behaviour
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.container.attr('transform', String(event.transform));
      });

    this.svg.call(zoom);
    this.container = this.svg.append('g');

    // Arrow marker definitions
    const defs = this.svg.append('defs');
    for (const [type, color] of Object.entries(EDGE_COLOR)) {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 14)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', color);
    }
  }

  /**
   * Render the given layout into the SVG.
   * Optionally filters nodes by type.
   */
  render(layout: GraphLayout, filterType?: string): void {
    this.container.selectAll('*').remove();
    if (this.simulation) this.simulation.stop();

    const nodes = filterType
      ? layout.nodes.filter(n => n.type === filterType)
      : layout.nodes;

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = layout.edges.filter(
      e => nodeIds.has(e.source.id) && nodeIds.has(e.target.id)
    );

    // Links
    const link = this.container.append('g')
      .selectAll<SVGLineElement, LayoutEdge>('line')
      .data(edges)
      .join('line')
      .attr('class', d => `link ${d.type}`)
      .attr('stroke', d => EDGE_COLOR[d.type] ?? '#30363d')
      .attr('stroke-width', d => Math.max(1, (d.weight ?? 1) * 0.5))
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Node circles
    const node = this.container.append('g')
      .selectAll<SVGCircleElement, LayoutNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => NODE_RADIUS[d.type] ?? 8)
      .attr('fill', d => NODE_COLOR[d.type] ?? '#8b949e')
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 1.5)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d: LayoutNode) => {
        this.tooltip
          .style('opacity', '1')
          .style('left', `${event.clientX + 12}px`)
          .style('top',  `${event.clientY - 28}px`)
          .html(`<strong>${d.label}</strong><br/>Type: ${d.type}<br/>Freq: ${d.frequency}`);
      })
      .on('mouseout', () => this.tooltip.style('opacity', '0'));

    // Labels
    this.container.append('g')
      .selectAll<SVGTextElement, LayoutNode>('text')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('x', d => d.x + (NODE_RADIUS[d.type] ?? 8) + 3)
      .attr('y', d => d.y + 4)
      .text(d => d.label.slice(0, 24) + (d.label.length > 24 ? '…' : ''));

    // D3 force simulation (refines pre-computed layout)
    this.simulation = d3.forceSimulation<LayoutNode, LayoutEdge>(nodes)
      .force('link', d3.forceLink<LayoutNode, LayoutEdge>(edges)
        .id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody<LayoutNode>().strength(-120))
      .force('collision', d3.forceCollide<LayoutNode>(d => (NODE_RADIUS[d.type] ?? 8) + 4))
      .alpha(0.3)
      .alphaDecay(0.04)
      .on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node.attr('cx', d => d.x).attr('cy', d => d.y);

        this.container.selectAll<SVGTextElement, LayoutNode>('text')
          .attr('x', d => d.x + (NODE_RADIUS[d.type] ?? 8) + 3)
          .attr('y', d => d.y + 4);
      });

    // Drag behaviour
    node.call(
      d3.drag<SVGCircleElement, LayoutNode>()
        .on('start', (event: d3.D3DragEvent<SVGCircleElement, LayoutNode, LayoutNode>, d: LayoutNode) => {
          if (!event.active) this.simulation?.alphaTarget(0.3).restart();
          d.vx = 0; d.vy = 0;
        })
        .on('drag', (event: d3.D3DragEvent<SVGCircleElement, LayoutNode, LayoutNode>, d: LayoutNode) => {
          d.x = event.x; d.y = event.y;
        })
        .on('end', (event: d3.D3DragEvent<SVGCircleElement, LayoutNode, LayoutNode>) => {
          if (!event.active) this.simulation?.alphaTarget(0);
        })
    );
  }

  /** Stop the running simulation */
  stop(): void {
    this.simulation?.stop();
  }
}
