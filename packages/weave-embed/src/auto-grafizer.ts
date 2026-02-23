/**
 * Auto Grafizer — M7: Automatic Context Grafization
 *
 * Orchestrates entity extraction + relationship detection to produce
 * graph-ready node and edge definitions from raw text.
 *
 * Integrates with WeaveGraph's NodeType / EdgeType enums
 * and optionally uses WeaveEmbed's EmbeddingService to cluster
 * semantically similar entities.
 */

import { EntityExtractor, ExtractedEntity, EntityExtractionConfig } from './entity-extractor';
import { RelationshipDetector, DetectedRelationship, RelationshipDetectionConfig } from './relationship-detector';
import { EmbeddingService } from './embedding-service';

// ── Output types (graph-ready, no WeaveGraph dependency) ──

export interface GrafizableNode {
  suggestedId: string;
  label: string;
  type: string; // Matches WeaveGraph NodeType enum values
  description?: string;
  frequency: number;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface GrafizableEdge {
  suggestedId: string;
  sourceLabel: string;
  targetLabel: string;
  type: string; // Matches WeaveGraph EdgeType enum values
  weight: number; // Confidence [0,1]
  evidence: string;
  metadata: Record<string, unknown>;
}

export interface GrafizationResult {
  nodes: GrafizableNode[];
  edges: GrafizableEdge[];
  stats: {
    totalEntitiesFound: number;
    entitiesAfterFilter: number;
    totalRelationshipsFound: number;
    relationshipsAfterFilter: number;
    processingTimeMs: number;
  };
}

export interface AutoGrafizerConfig {
  entityConfig?: Partial<EntityExtractionConfig>;
  relationshipConfig?: Partial<RelationshipDetectionConfig>;
  /** If true, uses EmbeddingService to merge semantically similar entities */
  mergeSemanticDuplicates?: boolean;
  /** Cosine similarity threshold to consider two entities duplicates */
  semanticMergeThreshold?: number;
  /** If true, filters edges whose source or target node was filtered out */
  filterOrphanEdges?: boolean;
}

// ──────────────────────────────────────────────────────────
// AutoGrafizer
// ──────────────────────────────────────────────────────────

export class AutoGrafizer {
  private entityExtractor: EntityExtractor;
  private relationshipDetector: RelationshipDetector;
  private embeddingService: EmbeddingService | null;
  private config: AutoGrafizerConfig;

  constructor(
    config?: AutoGrafizerConfig,
    embeddingService?: EmbeddingService
  ) {
    this.config = {
      mergeSemanticDuplicates: false,
      semanticMergeThreshold: 0.92,
      filterOrphanEdges: true,
      ...config,
    };
    this.entityExtractor = new EntityExtractor(config?.entityConfig);
    this.relationshipDetector = new RelationshipDetector(config?.relationshipConfig);
    this.embeddingService = embeddingService ?? null;
  }

  /**
   * Main entry point.
   * Analyzes `text` and returns nodes + edges ready for addition to WeaveGraph.
   */
  async grafize(text: string): Promise<GrafizationResult> {
    const startTime = Date.now();

    // Step 1: Extract entities
    const rawEntities = this.entityExtractor.extract(text);
    const totalEntities = rawEntities.length;

    // Step 2 (optional): Semantic deduplication
    const entities = this.config.mergeSemanticDuplicates && this.embeddingService
      ? await this.mergeSemanticDuplicates(rawEntities)
      : rawEntities;

    // Step 3: Detect relationships
    const rawRelationships = this.relationshipDetector.detect(text, entities);
    const totalRelationships = rawRelationships.length;

    // Step 4: Build GrafizableNode list
    const nodes = entities.map(e => this.toGrafizableNode(e));

    // Step 5: Build GrafizableEdge list
    const nodeLabels = new Set(nodes.map(n => n.label));
    let edges = rawRelationships.map((r, idx) =>
      this.toGrafizableEdge(r, idx)
    );

    // Step 6 (optional): Remove edges whose nodes were filtered/merged away
    if (this.config.filterOrphanEdges) {
      edges = edges.filter(
        e => nodeLabels.has(e.sourceLabel) && nodeLabels.has(e.targetLabel)
      );
    }

    return {
      nodes,
      edges,
      stats: {
        totalEntitiesFound: totalEntities,
        entitiesAfterFilter: nodes.length,
        totalRelationshipsFound: totalRelationships,
        relationshipsAfterFilter: edges.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Convenience: re-analyze text after a compression event and return
   * only NEW entities/edges relative to the provided existing labels.
   */
  async grafizeDelta(
    text: string,
    existingNodeLabels: string[]
  ): Promise<GrafizationResult> {
    const full = await this.grafize(text);
    const existing = new Set(existingNodeLabels.map(l => l.toLowerCase()));

    const newNodes = full.nodes.filter(
      n => !existing.has(n.label.toLowerCase())
    );
    const newLabels = new Set(newNodes.map(n => n.label));

    // Include edges where at least the source is new
    const newEdges = full.edges.filter(e => newLabels.has(e.sourceLabel));

    return {
      nodes: newNodes,
      edges: newEdges,
      stats: {
        ...full.stats,
        entitiesAfterFilter: newNodes.length,
        relationshipsAfterFilter: newEdges.length,
      },
    };
  }

  /**
   * Returns a summary of what would be grafized without producing
   * the full output structure (cheap preview).
   */
  preview(text: string): { entityCount: number; estimatedEdges: number; topEntities: string[] } {
    const entities = this.entityExtractor.extract(text);
    const topEntities = entities.slice(0, 5).map(e => e.text);
    const estimatedEdges = Math.min(entities.length * (entities.length - 1), 30);

    return { entityCount: entities.length, estimatedEdges, topEntities };
  }

  // ── private ──────────────────────────────────────────────

  private toGrafizableNode(entity: ExtractedEntity): GrafizableNode {
    return {
      suggestedId: `auto-${this.slugify(entity.text)}-${Date.now()}`,
      label: entity.text,
      type: entity.nodeType, // Already matches WeaveGraph NodeType values
      description: entity.contexts[0] ?? undefined,
      frequency: entity.frequency,
      confidence: entity.confidence,
      metadata: {
        ...entity.metadata,
        autoGrafized: true,
        extractedFrom: 'text',
        normalizedText: entity.normalizedText,
      },
    };
  }

  private toGrafizableEdge(rel: DetectedRelationship, index: number): GrafizableEdge {
    return {
      suggestedId: `auto-edge-${this.slugify(rel.sourceText)}-${this.slugify(rel.targetText)}-${index}`,
      sourceLabel: rel.sourceText,
      targetLabel: rel.targetText,
      type: rel.edgeType, // Already matches WeaveGraph EdgeType values
      weight: rel.confidence,
      evidence: rel.evidence,
      metadata: {
        autoGrafized: true,
        bidirectional: rel.bidirectional,
      },
    };
  }

  /**
   * Merge entities that are semantically similar using cosine similarity.
   * The entity with higher confidence wins.
   * Requires an initialized EmbeddingService.
   */
  private async mergeSemanticDuplicates(
    entities: ExtractedEntity[]
  ): Promise<ExtractedEntity[]> {
    if (!this.embeddingService || entities.length < 2) return entities;

    await this.embeddingService.initialize();
    const embeddings = await this.embeddingService.embedBatch(
      entities.map(e => e.text)
    );

    const merged: boolean[] = new Array(entities.length).fill(false);
    const threshold = this.config.semanticMergeThreshold ?? 0.92;

    for (let i = 0; i < entities.length; i++) {
      if (merged[i]) continue;
      for (let j = i + 1; j < entities.length; j++) {
        if (merged[j]) continue;
        const sim = this.embeddingService.cosineSimilarity(
          embeddings[i].embedding,
          embeddings[j].embedding
        );
        if (sim >= threshold) {
          // Merge j into i (keep higher confidence)
          if (entities[j].confidence > entities[i].confidence) {
            // j wins — keep i as "j" (swap)
            entities[i] = {
              ...entities[j],
              frequency: entities[i].frequency + entities[j].frequency,
              contexts: [...entities[i].contexts, ...entities[j].contexts].slice(0, 3),
            };
          } else {
            entities[i] = {
              ...entities[i],
              frequency: entities[i].frequency + entities[j].frequency,
              contexts: [...entities[i].contexts, ...entities[j].contexts].slice(0, 3),
            };
          }
          merged[j] = true;
        }
      }
    }

    return entities.filter((_, idx) => !merged[idx]);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  /** Get current config */
  getConfig(): AutoGrafizerConfig {
    return { ...this.config };
  }

  /** Get entity extractor (for advanced configuration) */
  getEntityExtractor(): EntityExtractor {
    return this.entityExtractor;
  }

  /** Get relationship detector (for advanced configuration) */
  getRelationshipDetector(): RelationshipDetector {
    return this.relationshipDetector;
  }
}
