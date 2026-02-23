/**
 * GraphLayout — M10
 *
 * Pure Fruchterman–Reingold force-directed layout algorithm.
 * No DOM, D3, or browser APIs — fully unit-testable in Node.
 *
 * Given a GraphSnapshot, computes (x, y) positions for each node
 * after running `iterations` simulation steps in a `width × height` canvas.
 */

import type { GraphSnapshot, LayoutNode, LayoutEdge, GraphLayout } from './types';

// ──────────────────────────────────────────────────────────────────────────────

export interface LayoutConfig {
  width?: number;         // default 800
  height?: number;        // default 600
  iterations?: number;    // default 100
  /** Repulsive constant k (auto-computed if omitted) */
  k?: number;
  /** Cooling rate per iteration (0–1, default 0.95) */
  cooling?: number;
  /** Gravity pulling nodes toward center (default 0.02) */
  gravity?: number;
}

// ──────────────────────────────────────────────────────────────────────────────

export class GraphLayoutEngine {
  private readonly cfg: Required<LayoutConfig>;

  constructor(config?: LayoutConfig) {
    const w = config?.width ?? 800;
    const h = config?.height ?? 600;
    this.cfg = {
      width: w,
      height: h,
      iterations: config?.iterations ?? 100,
      k: config?.k ?? Math.sqrt((w * h) / 100), // ideal spring length
      cooling: config?.cooling ?? 0.95,
      gravity: config?.gravity ?? 0.02,
    };
  }

  /**
   * Compute a force-directed layout from a GraphSnapshot.
   */
  compute(snapshot: GraphSnapshot): GraphLayout {
    const nodeList = Object.values(snapshot.nodes);
    const edgeList = Object.values(snapshot.edges);

    if (nodeList.length === 0) return { nodes: [], edges: [] };

    // Initialise with random positions spread across canvas
    const lNodes: LayoutNode[] = nodeList.map(n => ({
      ...n,
      frequency: n.frequency ?? 1,
      x: (Math.random() - 0.5) * this.cfg.width * 0.8 + this.cfg.width / 2,
      y: (Math.random() - 0.5) * this.cfg.height * 0.8 + this.cfg.height / 2,
      vx: 0,
      vy: 0,
    }));

    const byId = new Map(lNodes.map(n => [n.id, n]));

    let temp = this.cfg.width / 10; // initial temperature

    for (let iter = 0; iter < this.cfg.iterations; iter++) {
      // 1. Repulsion between all pairs
      for (let i = 0; i < lNodes.length; i++) {
        const u = lNodes[i]!;
        u.vx = 0;
        u.vy = 0;

        for (let j = 0; j < lNodes.length; j++) {
          if (i === j) continue;
          const v = lNodes[j]!;
          const dx = u.x - v.x;
          const dy = u.y - v.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = (this.cfg.k * this.cfg.k) / dist;
          u.vx += (dx / dist) * force;
          u.vy += (dy / dist) * force;
        }
      }

      // 2. Attraction along edges
      for (const edge of edgeList) {
        const u = byId.get(edge.sourceId);
        const v = byId.get(edge.targetId);
        if (!u || !v) continue;

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = (dist * dist) / this.cfg.k;

        u.vx += (dx / dist) * force;
        u.vy += (dy / dist) * force;
        v.vx -= (dx / dist) * force;
        v.vy -= (dy / dist) * force;
      }

      // 3. Gravity toward center
      for (const n of lNodes) {
        const cx = this.cfg.width / 2;
        const cy = this.cfg.height / 2;
        n.vx += (cx - n.x) * this.cfg.gravity;
        n.vy += (cy - n.y) * this.cfg.gravity;
      }

      // 4. Apply velocities, capped by temperature
      for (const n of lNodes) {
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 0) {
          n.x += (n.vx / speed) * Math.min(speed, temp);
          n.y += (n.vy / speed) * Math.min(speed, temp);
        }
        // Clamp to canvas bounds with 20px margin
        n.x = Math.max(20, Math.min(this.cfg.width - 20, n.x));
        n.y = Math.max(20, Math.min(this.cfg.height - 20, n.y));
      }

      temp *= this.cfg.cooling;
    }

    // Build layout edges (resolve id → LayoutNode references)
    const lEdges: LayoutEdge[] = edgeList.flatMap(e => {
      const src = byId.get(e.sourceId);
      const tgt = byId.get(e.targetId);
      if (!src || !tgt) return [];
      return [{ ...e, weight: e.weight ?? 1, source: src, target: tgt }];
    });

    return { nodes: lNodes, edges: lEdges };
  }

  /**
   * Returns true if all computed node positions are within canvas bounds.
   */
  static validateBounds(layout: GraphLayout, width: number, height: number): boolean {
    return layout.nodes.every(
      n => n.x >= 0 && n.x <= width && n.y >= 0 && n.y <= height
    );
  }
}
