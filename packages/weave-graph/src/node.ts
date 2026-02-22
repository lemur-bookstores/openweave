import { Node, NodeType } from "./types";
import { randomUUID } from "crypto";

/**
 * NodeBuilder utility for creating and managing graph nodes
 */
export class NodeBuilder {
  /**
   * Create a new node with the given type and label
   */
  static create(
    type: NodeType,
    label: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): Node {
    return {
      id: randomUUID(),
      type,
      label,
      description,
      metadata: metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
      frequency: 1,
    };
  }

  /**
   * Create a CONCEPT node
   */
  static concept(label: string, description?: string): Node {
    return this.create(NodeType.CONCEPT, label, description);
  }

  /**
   * Create a DECISION node
   */
  static decision(label: string, description?: string): Node {
    return this.create(NodeType.DECISION, label, description);
  }

  /**
   * Create a MILESTONE node
   */
  static milestone(label: string, description?: string): Node {
    return this.create(NodeType.MILESTONE, label, description);
  }

  /**
   * Create an ERROR node
   */
  static error(label: string, description?: string): Node {
    return this.create(NodeType.ERROR, label, description);
  }

  /**
   * Create a CORRECTION node
   */
  static correction(label: string, description?: string): Node {
    return this.create(NodeType.CORRECTION, label, description);
  }

  /**
   * Create a CODE_ENTITY node
   */
  static codeEntity(label: string, description?: string): Node {
    return this.create(NodeType.CODE_ENTITY, label, description);
  }

  /**
   * Clone a node with updated values
   */
  static clone(
    node: Node,
    updates?: Partial<Node>
  ): Node {
    return {
      ...node,
      updatedAt: new Date(),
      ...updates,
    };
  }

  /**
   * Increment frequency counter for a node
   */
  static incrementFrequency(node: Node): Node {
    return {
      ...node,
      frequency: (node.frequency ?? 1) + 1,
      updatedAt: new Date(),
    };
  }
}
