import { Edge, EdgeType } from "./types";
import { randomUUID } from "crypto";

/**
 * EdgeBuilder utility for creating and managing graph edges
 */
export class EdgeBuilder {
  /**
   * Create a new edge between two nodes
   */
  static create(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    weight?: number,
    metadata?: Record<string, unknown>
  ): Edge {
    return {
      id: randomUUID(),
      sourceId,
      targetId,
      type,
      weight: weight ?? 1.0,
      metadata: metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create a RELATES edge
   */
  static relates(
    sourceId: string,
    targetId: string,
    weight?: number
  ): Edge {
    return this.create(sourceId, targetId, EdgeType.RELATES, weight);
  }

  /**
   * Create a CAUSES edge
   */
  static causes(
    sourceId: string,
    targetId: string,
    weight?: number
  ): Edge {
    return this.create(sourceId, targetId, EdgeType.CAUSES, weight);
  }

  /**
   * Create a CORRECTS edge (links CORRECTION to ERROR)
   */
  static corrects(
    correctionId: string,
    errorId: string,
    weight?: number
  ): Edge {
    return this.create(correctionId, errorId, EdgeType.CORRECTS, weight);
  }

  /**
   * Create an IMPLEMENTS edge (code → decision)
   */
  static implements(
    codeEntityId: string,
    decisionId: string,
    weight?: number
  ): Edge {
    return this.create(codeEntityId, decisionId, EdgeType.IMPLEMENTS, weight);
  }

  /**
   * Create a DEPENDS_ON edge
   */
  static dependsOn(
    sourceId: string,
    targetId: string,
    weight?: number
  ): Edge {
    return this.create(sourceId, targetId, EdgeType.DEPENDS_ON, weight);
  }

  /**
   * Create a BLOCKS edge
   */
  static blocks(
    blockerId: string,
    blockedId: string,
    weight?: number
  ): Edge {
    return this.create(blockerId, blockedId, EdgeType.BLOCKS, weight);
  }

  /**
   * Clone an edge with updated values
   */
  static clone(
    edge: Edge,
    updates?: Partial<Edge>
  ): Edge {
    return {
      ...edge,
      updatedAt: new Date(),
      ...updates,
    };
  }

  /**
   * Increase the weight (confidence) of an edge
   */
  static reinforceWeight(edge: Edge, factor: number = 1.1): Edge {
    return {
      ...edge,
      weight: (edge.weight ?? 1.0) * factor,
      updatedAt: new Date(),
    };
  }
}
