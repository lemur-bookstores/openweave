/**
 * Node Types for WeaveGraph
 * Represents different kinds of concepts in the knowledge graph
 */
export enum NodeType {
  CONCEPT = "CONCEPT",
  DECISION = "DECISION",
  MILESTONE = "MILESTONE",
  ERROR = "ERROR",
  CORRECTION = "CORRECTION",
  CODE_ENTITY = "CODE_ENTITY",
}

/**
 * Edge Types for WeaveGraph
 * Represents different semantic relationships between nodes
 */
export enum EdgeType {
  RELATES = "RELATES",
  CAUSES = "CAUSES",
  CORRECTS = "CORRECTS",
  IMPLEMENTS = "IMPLEMENTS",
  DEPENDS_ON = "DEPENDS_ON",
  BLOCKS = "BLOCKS",
}

/**
 * Node in the WeaveGraph
 * Base representation of a concept, decision, error, etc.
 */
export interface Node {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  frequency?: number; // How many times this concept was mentioned
}

/**
 * Edge in the WeaveGraph
 * Represents a semantic relationship between two nodes
 */
export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight?: number; // Confidence or strength of the relationship
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Query result from keyword-based search
 */
export interface QueryResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Serialized graph for persistence
 */
export interface GraphSnapshot {
  nodes: Record<string, Node>;
  edges: Record<string, Edge>;
  metadata: {
    chatId: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
    compressionThreshold: number;
  };
}
