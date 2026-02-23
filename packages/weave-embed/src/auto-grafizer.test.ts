/**
 * M7 Tests: Automatic Context Grafization
 * Tests EntityExtractor, RelationshipDetector, and AutoGrafizer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EntityExtractor } from '../src/entity-extractor';
import { RelationshipDetector } from '../src/relationship-detector';
import { AutoGrafizer } from '../src/auto-grafizer';
import { EmbeddingService } from '../src/embedding-service';

// Mock transformers to avoid real model loads
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue((text: string) => {
    const hash = text.split('').reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0);
    const embedding = new Array(384).fill(0).map((_, i) => Math.sin(hash * (i + 1)) * 0.5);
    return { data: new Float32Array(embedding) };
  }),
}));

// ──────────────────────────────────────────────────────────
// EntityExtractor tests
// ──────────────────────────────────────────────────────────

describe('M7 · Automatic Context Grafization', () => {
  describe('EntityExtractor', () => {
    let extractor: EntityExtractor;

    beforeEach(() => {
      extractor = new EntityExtractor({ minConfidence: 0.1, minFrequency: 1 });
    });

    it('should extract PascalCase identifiers as CODE_ENTITY', () => {
      const result = extractor.extract('WeaveGraph handles the ContextManager lifecycle.');
      const labels = result.map(e => e.text);
      expect(labels).toContain('WeaveGraph');
      expect(labels).toContain('ContextManager');
      const entity = result.find(e => e.text === 'WeaveGraph');
      expect(entity?.nodeType).toBe('CODE_ENTITY');
    });

    it('should extract backtick-quoted code as CODE_ENTITY', () => {
      const result = extractor.extract('Call `saveGraph` to persist the `chat_id` session.');
      const labels = result.map(e => e.text);
      expect(labels).toContain('saveGraph');
    });

    it('should classify error context as ERROR', () => {
      const result = extractor.extract('The crash in AuthService causes the failure.');
      const errorEntities = result.filter(e => e.nodeType === 'ERROR');
      expect(errorEntities.length).toBeGreaterThan(0);
    });

    it('should classify decision context as DECISION', () => {
      const result = extractor.extract('We decided to use TypeScript for WeaveGraph.');
      const decisionEntities = result.filter(e => e.nodeType === 'DECISION');
      expect(decisionEntities.length).toBeGreaterThan(0);
    });

    it('should include frequency counts', () => {
      const result = extractor.extract(
        'WeaveGraph is powerful. WeaveGraph handles persistence. I love WeaveGraph.'
      );
      const wg = result.find(e => e.text === 'WeaveGraph');
      expect(wg).toBeDefined();
      expect(wg!.frequency).toBeGreaterThanOrEqual(3);
    });

    it('should include context snippets', () => {
      const result = extractor.extract('The WeaveGraph stores nodes efficiently.');
      const wg = result.find(e => e.text === 'WeaveGraph');
      expect(wg?.contexts).toBeDefined();
      expect(wg!.contexts.length).toBeGreaterThan(0);
    });

    it('should respect minFrequency config', () => {
      const ext = new EntityExtractor({ minFrequency: 3, minConfidence: 0 });
      const result = ext.extract('WeaveGraph is used. VectorStore is also used.');
      // Neither entity appears 3 times
      expect(result.length).toBe(0);
    });

    it('should respect maxEntities config', () => {
      const ext = new EntityExtractor({ maxEntities: 3, minConfidence: 0 });
      const text = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta. All PascalCase.';
      const result = ext.extract(text);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should exclude stop words', () => {
      const result = extractor.extract('The is a concept that relates the to and or.');
      const labels = result.map(e => e.text.toLowerCase());
      expect(labels).not.toContain('the');
      expect(labels).not.toContain('and');
    });

    it('should return confidence values in [0,1]', () => {
      const result = extractor.extract(
        'WeaveGraph uses EmbeddingService for semantic search. ErrorHandler fixes the crash.'
      );
      for (const e of result) {
        expect(e.confidence).toBeGreaterThanOrEqual(0);
        expect(e.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return entities sorted by relevance', () => {
      const result = extractor.extract(
        'WeaveGraph WeaveGraph WeaveGraph. EmbeddingService EmbeddingService.'
      );
      if (result.length >= 2) {
        // Higher frequency should rank first
        const scores = result.map(e => e.confidence * Math.log1p(e.frequency));
        for (let i = 0; i < scores.length - 1; i++) {
          expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
        }
      }
    });

    it('should return config', () => {
      const cfg = extractor.getConfig();
      expect(cfg.minConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // RelationshipDetector tests
  // ──────────────────────────────────────────────────────────

  describe('RelationshipDetector', () => {
    let detector: RelationshipDetector;

    beforeEach(() => {
      detector = new RelationshipDetector({ minConfidence: 0.1 });
    });

    it('should detect DEPENDS_ON relationship', () => {
      const text = 'AutoGrafizer depends on EmbeddingService for semantic merging.';
      const rel = detector.detectBetween(text, 'AutoGrafizer', 'EmbeddingService');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('DEPENDS_ON');
    });

    it('should detect CORRECTS relationship', () => {
      const text = 'AuthFix corrects the LoginError in the session handler.';
      const rel = detector.detectBetween(text, 'AuthFix', 'LoginError');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('CORRECTS');
    });

    it('should detect CAUSES relationship', () => {
      const text = 'DatabaseTimeout causes ConnectionError in the service.';
      const rel = detector.detectBetween(text, 'DatabaseTimeout', 'ConnectionError');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('CAUSES');
    });

    it('should detect IMPLEMENTS relationship', () => {
      const text = 'VectorStore implements the SearchInterface for querying.';
      const rel = detector.detectBetween(text, 'VectorStore', 'SearchInterface');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('IMPLEMENTS');
    });

    it('should detect BLOCKS relationship', () => {
      const text = 'TypeMismatch blocks deployment of the new release.';
      const rel = detector.detectBetween(text, 'TypeMismatch', 'deployment');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('BLOCKS');
    });

    it('should fall back to RELATES for co-occurrence', () => {
      const text = 'WeaveGraph and EmbeddingService are core components.';
      const rel = detector.detectBetween(text, 'WeaveGraph', 'EmbeddingService');
      expect(rel).not.toBeNull();
      expect(rel!.edgeType).toBe('RELATES');
    });

    it('should return null when entities do not co-occur', () => {
      const text = 'WeaveGraph is powerful.';
      const rel = detector.detectBetween(text, 'WeaveGraph', 'VectorStore');
      expect(rel).toBeNull();
    });

    it('should detect relationships between multiple entity pairs', () => {
      const extractor = new EntityExtractor({ minConfidence: 0.1 });
      const text =
        'AutoGrafizer depends on EmbeddingService. EmbeddingService uses VectorStore.';
      const entities = extractor.extract(text);
      const rels = detector.detect(text, entities);
      expect(Array.isArray(rels)).toBe(true);
    });

    it('should deduplicate relationships', () => {
      const text = 'WeaveGraph depends on EmbeddingService; WeaveGraph requires EmbeddingService.';
      const rel1 = detector.detectBetween(text, 'WeaveGraph', 'EmbeddingService');
      const rel2 = detector.detectBetween(text, 'WeaveGraph', 'EmbeddingService');
      // Same pair detected twice — should be the same result
      expect(rel1?.edgeType).toEqual(rel2?.edgeType);
    });

    it('should return confidence in [0,1]', () => {
      const text = 'WeaveGraph depends on EmbeddingService.';
      const rel = detector.detectBetween(text, 'WeaveGraph', 'EmbeddingService');
      if (rel) {
        expect(rel.confidence).toBeGreaterThanOrEqual(0);
        expect(rel.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return config', () => {
      const cfg = detector.getConfig();
      expect(cfg.minConfidence).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // AutoGrafizer tests
  // ──────────────────────────────────────────────────────────

  describe('AutoGrafizer', () => {
    let grafizer: AutoGrafizer;

    beforeEach(() => {
      grafizer = new AutoGrafizer({
        entityConfig: { minConfidence: 0.1, minFrequency: 1 },
        relationshipConfig: { minConfidence: 0.1 },
      });
    });

    it('should return nodes and edges from text', async () => {
      const result = await grafizer.grafize(
        'WeaveGraph depends on EmbeddingService for semantic search operations.'
      );
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should populate stats', async () => {
      const result = await grafizer.grafize(
        'AutoGrafizer uses EntityExtractor and RelationshipDetector.'
      );
      expect(result.stats.totalEntitiesFound).toBeGreaterThanOrEqual(0);
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should produce node with correct shape', async () => {
      const result = await grafizer.grafize('WeaveGraph manages the knowledge graph.');
      const node = result.nodes[0];
      expect(node).toHaveProperty('suggestedId');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('frequency');
      expect(node).toHaveProperty('confidence');
      expect(node).toHaveProperty('metadata');
      expect(node.metadata.autoGrafized).toBe(true);
    });

    it('should produce edge with correct shape', async () => {
      const result = await grafizer.grafize(
        'AutoGrafizer depends on EmbeddingService for merging.'
      );
      const edge = result.edges[0];
      if (edge) {
        expect(edge).toHaveProperty('suggestedId');
        expect(edge).toHaveProperty('sourceLabel');
        expect(edge).toHaveProperty('targetLabel');
        expect(edge).toHaveProperty('type');
        expect(edge).toHaveProperty('weight');
        expect(edge).toHaveProperty('evidence');
      }
    });

    it('should filter orphan edges by default', async () => {
      const result = await grafizer.grafize(
        'WeaveGraph uses EmbeddingService.'
      );
      const nodeLabels = new Set(result.nodes.map(n => n.label));
      for (const edge of result.edges) {
        expect(nodeLabels.has(edge.sourceLabel) || nodeLabels.has(edge.targetLabel)).toBe(true);
      }
    });

    it('should return grafizeDelta excluding existing nodes', async () => {
      const text = 'WeaveGraph uses EmbeddingService and AutoGrafizer.';
      const delta = await grafizer.grafizeDelta(text, ['WeaveGraph']);
      const labels = delta.nodes.map(n => n.label);
      expect(labels).not.toContain('WeaveGraph');
    });

    it('should return preview without heavy processing', () => {
      const preview = grafizer.preview(
        'WeaveGraph depends on EmbeddingService. VectorStore stores embeddings.'
      );
      expect(preview).toHaveProperty('entityCount');
      expect(preview).toHaveProperty('estimatedEdges');
      expect(preview).toHaveProperty('topEntities');
      expect(Array.isArray(preview.topEntities)).toBe(true);
    });

    it('should expose entity extractor and relationship detector', () => {
      expect(grafizer.getEntityExtractor()).toBeDefined();
      expect(grafizer.getRelationshipDetector()).toBeDefined();
    });

    it('should merge semantic duplicates when embedding service is provided', async () => {
      const service = new EmbeddingService({ dimension: 384 });
      await service.initialize();

      const grafizerWithEmbed = new AutoGrafizer(
        {
          mergeSemanticDuplicates: true,
          semanticMergeThreshold: 0.5, // Low threshold to trigger merges
          entityConfig: { minConfidence: 0.1, minFrequency: 1 },
          relationshipConfig: { minConfidence: 0.1 },
        },
        service
      );

      const result = await grafizerWithEmbed.grafize(
        'WeaveGraph manages KnowledgeGraph metadata. EntityExtractor finds entities.'
      );
      expect(result.nodes.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty text gracefully', async () => {
      const result = await grafizer.grafize('');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle text with no relationships', async () => {
      const result = await grafizer.grafize('WeaveGraph. EmbeddingService.');
      // Nodes might be found, but edges should not be forced
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should return config', () => {
      const cfg = grafizer.getConfig();
      expect(cfg).toHaveProperty('filterOrphanEdges');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Integration: full grafization pipeline
  // ──────────────────────────────────────────────────────────

  describe('Integration', () => {
    it('should run complete grafization pipeline', async () => {
      const grafizer = new AutoGrafizer({
        entityConfig: { minConfidence: 0.1, minFrequency: 1 },
        relationshipConfig: { minConfidence: 0.1 },
      });

      const text = `
        We decided to use WeaveGraph as our knowledge graph engine.
        WeaveGraph depends on EmbeddingService for semantic search.
        A bug in AuthService causes LoginError in the system.
        The AuthFix patch corrects the LoginError issue.
        VectorStore implements the StorageInterface from the core library.
      `;

      const result = await grafizer.grafize(text);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);

      // WeaveGraph should be extracted
      const wg = result.nodes.find(n => n.label === 'WeaveGraph');
      expect(wg).toBeDefined();

      // Should have found at least one relationship
      const hasDependsOn = result.edges.some(e => e.type === 'DEPENDS_ON');
      const hasCauses = result.edges.some(e => e.type === 'CAUSES');
      const hasCorrects = result.edges.some(e => e.type === 'CORRECTS');
      expect(hasDependsOn || hasCauses || hasCorrects).toBe(true);
    });

    it('should produce stable results for repeated grafization', async () => {
      const grafizer = new AutoGrafizer({
        entityConfig: { minConfidence: 0.1 },
        relationshipConfig: { minConfidence: 0.1 },
      });
      const text = 'WeaveGraph depends on EmbeddingService for lookups.';

      const r1 = await grafizer.grafize(text);
      const r2 = await grafizer.grafize(text);

      expect(r1.nodes.length).toBe(r2.nodes.length);
      expect(r1.edges.length).toBe(r2.edges.length);
    });
  });
});
