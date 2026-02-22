/**
 * Weave Embed - Core Functionality Tests with Mocks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingService } from '../src/embedding-service';
import { VectorStore } from '../src/vector-store';
import { HybridSearch } from '../src/hybrid-search';

// Mock transformers library to avoid dependency issues
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue((text: string) => {
    const hash = text.split('').reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0);
    const embedding = new Array(384).fill(0).map((_, i) => Math.sin(hash * (i + 1)) * 0.5);
    return { data: new Float32Array(embedding) };
  }),
}));

describe('Weave Embed', () => {
  describe('EmbeddingService', () => {
    let service: EmbeddingService;

    beforeEach(() => {
      service = new EmbeddingService({ dimension: 384, normalize: true });
    });

    it('should initialize', async () => {
      expect(service.isReady()).toBe(false);
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });

    it('should embed text', async () => {
      await service.initialize();
      const result = await service.embed('Hello world');
      expect(result.embedding.length).toBe(384);
      expect(result.text).toBe('Hello world');
    });

    it('should batch embed', async () => {
      await service.initialize();
      const results = await service.embedBatch(['Text 1', 'Text 2']);
      expect(results).toHaveLength(2);
    });

    it('should cache embeddings', async () => {
      await service.initialize();
      const text = 'Cache test';
      const r1 = await service.embed(text);
      const r2 = await service.embed(text);
      expect(r1.embedding).toEqual(r2.embedding);
      expect(service.getCacheSize()).toBeGreaterThan(0);
    });

    it('should calculate cosine similarity', async () => {
      const sim = service.cosineSimilarity([1, 0], [0.5, 0.5]);
      expect(sim).toBeCloseTo(0.707, 1);
    });

    it('should calculate euclidean distance', async () => {
      const dist = service.euclideanDistance([0, 0], [3, 4]);
      expect(dist).toBe(5);
    });

    it('should return config', () => {
      const cfg = service.getConfig();
      expect(cfg.dimension).toBe(384);
    });

    it('should clear cache', async () => {
      await service.initialize();
      await service.embed('Test');
      service.clearCache();
      expect(service.getCacheSize()).toBe(0);
    });
  });

  describe('VectorStore', () => {
    let vectorStore: VectorStore;

    beforeEach(async () => {
      const service = new EmbeddingService({ dimension: 384 });
      await service.initialize();
      vectorStore = new VectorStore(service);
    });

    it('should add node embedding', async () => {
      const emb = await vectorStore.addNodeEmbedding('n1', 'Node1', 'Text');
      expect(emb.nodeId).toBe('n1');
      expect(emb.embedding.length).toBe(384);
    });

    it('should add batch embeddings', async () => {
      const results = await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'Node1', text: 'Text 1' },
        { nodeId: 'n2', nodeLabel: 'Node2', text: 'Text 2' },
      ]);
      expect(results).toHaveLength(2);
    });

    it('should retrieve node embedding', async () => {
      await vectorStore.addNodeEmbedding('n1', 'Node1', 'Text');
      const emb = vectorStore.getNodeEmbedding('n1');
      expect(emb?.nodeId).toBe('n1');
    });

    it('should check node has embedding', async () => {
      await vectorStore.addNodeEmbedding('n1', 'Node1', 'Text');
      expect(vectorStore.hasEmbedding('n1')).toBe(true);
      expect(vectorStore.hasEmbedding('n999')).toBe(false);
    });

    it('should search similar nodes', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'Auth', text: 'Authentication' },
        { nodeId: 'n2', nodeLabel: 'DB', text: 'Database' },
      ]);
      const results = await vectorStore.searchSimilar('auth', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should apply threshold filter', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'Auth', text: 'Authentication' },
        { nodeId: 'n2', nodeLabel: 'DB', text: 'Database' },
      ]);
      const high = await vectorStore.searchSimilar('auth', 10, 0.8);
      const low = await vectorStore.searchSimilar('auth', 10, 0.0);
      expect(high.length).toBeLessThanOrEqual(low.length);
    });

    it('should remove node', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      const removed = vectorStore.removeNodeEmbedding('n1');
      expect(removed).toBe(true);
      expect(vectorStore.hasEmbedding('n1')).toBe(false);
    });

    it('should get node IDs', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'N1', text: 'T1' },
        { nodeId: 'n2', nodeLabel: 'N2', text: 'T2' },
      ]);
      const ids = vectorStore.getNodeIds();
      expect(ids).toContain('n1');
      expect(ids).toContain('n2');
    });

    it('should get stats', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'N1', text: 'T1' },
        { nodeId: 'n2', nodeLabel: 'N2', text: 'T2' },
      ]);
      const stats = vectorStore.getStats();
      expect(stats.totalNodes).toBe(2);
      expect(stats.modelDimension).toBe(384);
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should clear all embeddings', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      vectorStore.clear();
      expect(vectorStore.getNodeIds()).toHaveLength(0);
    });

    it('should export embeddings', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      const exp = vectorStore.export();
      expect(exp['n1']).toBeDefined();
    });

    it('should import embeddings', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      const exported = vectorStore.export();
      vectorStore.clear();
      vectorStore.import(exported);
      expect(vectorStore.hasEmbedding('n1')).toBe(true);
    });
  });

  describe('HybridSearch', () => {
    let hybridSearch: HybridSearch;
    let vectorStore: VectorStore;

    beforeEach(async () => {
      const service = new EmbeddingService({ dimension: 384 });
      await service.initialize();
      vectorStore = new VectorStore(service);
      hybridSearch = new HybridSearch(vectorStore);
    });

    it('should initialize', () => {
      expect(hybridSearch).toBeDefined();
      expect(hybridSearch.getGraphNodes()).toBeDefined();
    });

    it('should set graph nodes', () => {
      hybridSearch.setGraphNodes([
        { id: 'n1', label: 'N1', type: 'CLASS', relatedNodeIds: [], frequency: 5 },
      ]);
      expect(hybridSearch.getGraphNodes().size).toBe(1);
    });

    it('should search with default weights', async () => {
      await vectorStore.addNodeEmbedding('n1', 'Node1', 'Test content');
      hybridSearch.setGraphNodes([
        { id: 'n1', label: 'Node1', type: 'CLASS', relatedNodeIds: [], frequency: 5 },
      ]);
      const results = await hybridSearch.search({
        text: 'test',
        topK: 10,
        threshold: 0,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect topK', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'N1', text: 'T' },
        { nodeId: 'n2', nodeLabel: 'N2', text: 'T' },
        { nodeId: 'n3', nodeLabel: 'N3', text: 'T' },
      ]);
      const results = await hybridSearch.search({
        text: 'test',
        topK: 2,
        threshold: 0,
      });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply threshold filter', async () => {
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'N1', text: 'Topic' },
        { nodeId: 'n2', nodeLabel: 'N2', text: 'Other' },
      ]);
      const high = await hybridSearch.search({
        text: 'topic',
        topK: 10,
        threshold: 0.99,
      });
      const low = await hybridSearch.search({
        text: 'topic',
        topK: 10,
        threshold: 0,
      });
      expect(high.length).toBeLessThanOrEqual(low.length);
    });

    it('should use custom weights', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      const r1 = await hybridSearch.search({
        text: 't',
        topK: 10,
        threshold: 0,
        weights: { semantic: 0.8, structural: 0.2 },
      });
      const r2 = await hybridSearch.search({
        text: 't',
        topK: 10,
        threshold: 0,
        weights: { semantic: 0.2, structural: 0.8 },
      });
      expect(Array.isArray(r1)).toBe(true);
      expect(Array.isArray(r2)).toBe(true);
    });

    it('should disable structural search', async () => {
      await vectorStore.addNodeEmbedding('n1', 'N1', 'T');
      const r = await hybridSearch.search({
        text: 't',
        topK: 10,
        threshold: 0,
        useStructuralSearch: false,
      });
      if (r.length > 0) {
        expect(r[0].structuralScore).toBe(0);
      }
    });

    it('should generate explanations', async () => {
      await vectorStore.addNodeEmbedding('n1', 'Node1', 'Test');
      hybridSearch.setGraphNodes([
        { id: 'n1', label: 'Node1', type: 'CLASS', relatedNodeIds: ['n2'], frequency: 8 },
      ]);
      const r = await hybridSearch.search({
        text: 'test',
        topK: 10,
        threshold: 0,
      });
      if (r.length > 0) {
        expect(r[0].explanation).toBeDefined();
        expect(r[0].explanation.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration', () => {
    it('should handle complete workflow', async () => {
      const service = new EmbeddingService({ dimension: 384 });
      await service.initialize();
      const vectorStore = new VectorStore(service);
      const hybridSearch = new HybridSearch(vectorStore);

      // Add nodes
      await vectorStore.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'Auth', text: 'Login system' },
        { nodeId: 'n2', nodeLabel: 'Token', text: 'JWT tokens' },
      ]);

      // Set structure
      hybridSearch.setGraphNodes([
        { id: 'n1', label: 'Auth', type: 'CLASS', relatedNodeIds: ['n2'], frequency: 10 },
        { id: 'n2', label: 'Token', type: 'CLASS', relatedNodeIds: ['n1'], frequency: 8 },
      ]);

      // Search
      const results = await hybridSearch.search({
        text: 'login token',
        topK: 10,
        threshold: 0,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should persist and restore embeddings', async () => {
      const service = new EmbeddingService({ dimension: 384 });
      await service.initialize();
      const vs1 = new VectorStore(service);

      await vs1.addNodeEmbeddingsBatch([
        { nodeId: 'n1', nodeLabel: 'N1', text: 'T1' },
        { nodeId: 'n2', nodeLabel: 'N2', text: 'T2' },
      ]);

      const exported = vs1.export();
      const vs2 = new VectorStore(service);
      vs2.import(exported);

      expect(vs2.getNodeIds()).toHaveLength(2);
      expect(vs2.getStats().totalNodes).toBe(2);
    });
  });
});
