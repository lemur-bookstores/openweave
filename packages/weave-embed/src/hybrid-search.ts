/**
 * Hybrid Search - Combining semantic + structural graph search
 */

import { HybridSearchResult, SearchQuery } from './types';
import { VectorStore } from './vector-store';

/**
 * Mock graph interface for structural search
 * In real implementation, this would integrate with WeaveGraph
 */
interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  relatedNodeIds: string[];
  frequency: number;
}

export class HybridSearch {
  private vectorStore: VectorStore;
  private graphNodes: Map<string, GraphNode> = new Map();

  constructor(vectorStore?: VectorStore) {
    this.vectorStore = vectorStore || new VectorStore();
  }

  /**
   * Initialize with graph nodes for structural search
   */
  setGraphNodes(nodes: GraphNode[]): void {
    this.graphNodes.clear();
    for (const node of nodes) {
      this.graphNodes.set(node.id, node);
    }
  }

  /**
   * Perform hybrid search combining semantic and structural scores
   */
  async search(query: SearchQuery): Promise<HybridSearchResult[]> {
    const {
      text,
      topK,
      threshold = 0.3,
      useStructuralSearch = true,
      weights = { semantic: 0.7, structural: 0.3 },
    } = query;

    // Get semantic results
    const semanticResults = await this.vectorStore.searchSimilar(text, topK * 2, threshold);

    if (semanticResults.length === 0) {
      return [];
    }

    // Enrich with structural scores
    const hybridResults: HybridSearchResult[] = semanticResults.map((result) => {
      const graphNode = this.graphNodes.get(result.nodeId);
      const structuralScore = useStructuralSearch && graphNode ? this.calculateStructuralScore(graphNode) : 0;

      const semanticScore = result.similarity;
      const normalizedSemantic = Math.min(1, Math.max(0, semanticScore));
      const normalizedStructural = Math.min(1, Math.max(0, structuralScore));

      const combinedScore =
        weights.semantic * normalizedSemantic + weights.structural * normalizedStructural;

      return {
        nodeId: result.nodeId,
        nodeLabel: result.nodeLabel,
        nodeType: graphNode?.type || 'UNKNOWN',
        semanticScore: normalizedSemantic,
        structuralScore: normalizedStructural,
        combinedScore,
        explanation: this.generateExplanation(
          result.nodeLabel,
          semanticScore,
          structuralScore,
          graphNode
        ),
      };
    });

    // Sort by combined score
    return hybridResults
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK)
      .filter((r) => r.combinedScore >= threshold);
  }

  /**
   * Calculate structural importance score
   * Factors: frequency, number of connections, node type
   */
  private calculateStructuralScore(node: GraphNode): number {
    let score = 0;

    // Frequency-based score (0-0.6)
    const frequencyScore = Math.min(0.6, node.frequency * 0.1);
    score += frequencyScore;

    // Connectivity score (0-0.3)
    const connectivityScore = Math.min(0.3, node.relatedNodeIds.length * 0.05);
    score += connectivityScore;

    // Type-based boost (0-0.1)
    const typeBoost = this.getTypeBoost(node.type);
    score += typeBoost;

    return Math.min(1.0, score);
  }

  /**
   * Get boost score based on node type
   */
  private getTypeBoost(nodeType: string): number {
    const typeBoosts: Record<string, number> = {
      CLASS: 0.1,
      FUNCTION: 0.08,
      INTERFACE: 0.08,
      CONCEPT: 0.06,
      DECISION: 0.07,
      ERROR: 0.05,
      MODULE: 0.05,
      TYPE: 0.06,
      default: 0.02,
    };

    return typeBoosts[nodeType] || typeBoosts.default;
  }

  /**
   * Generate explanation for search result
   */
  private generateExplanation(
    label: string,
    semanticScore: number,
    structuralScore: number,
    graphNode?: GraphNode
  ): string {
    const parts: string[] = [];

    if (semanticScore > 0.8) {
      parts.push('Strong semantic match');
    } else if (semanticScore > 0.6) {
      parts.push('Good semantic match');
    } else {
      parts.push('Fair semantic match');
    }

    if (graphNode) {
      if (structuralScore > 0.5) {
        parts.push(`highly connected (${graphNode.relatedNodeIds.length} links)`);
      }
      if (graphNode.frequency > 5) {
        parts.push(`frequently referenced (${graphNode.frequency}x)`);
      }
    }

    return `${label}: ${parts.join(', ')}`;
  }

  /**
   * Get vector store
   */
  getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  /**
   * Get graph nodes map
   */
  getGraphNodes(): Map<string, GraphNode> {
    return this.graphNodes;
  }
}
