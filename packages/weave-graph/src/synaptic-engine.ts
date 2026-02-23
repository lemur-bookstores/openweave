import { Edge, Node } from "./types.js";
import { EdgeBuilder } from "./edge.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SynapticOptions {
  /** Minimum Jaccard similarity required to create a retroactive edge. Default: 0.72 */
  threshold?: number;
  /** Maximum number of retroactive edges created per new node. Default: 20 */
  maxConnections?: number;
}

const DEFAULT_THRESHOLD = 0.72;
const DEFAULT_MAX_CONNECTIONS = 20;

// ---------------------------------------------------------------------------
// Stop-words (excluded from tokenization)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "for", "and", "nor", "but", "or", "yet", "so", "in", "on", "at",
  "to", "of", "by", "up", "as", "if", "it", "its", "with", "this",
  "that", "from", "not", "no", "vs", "via", "than", "then", "use",
  "using", "used",
]);

// ---------------------------------------------------------------------------
// Minimal graph interface — avoids circular dependency with index.ts
// ---------------------------------------------------------------------------

/**
 * Minimal structural interface that ContextGraphManager satisfies.
 * SynapticEngine only needs these two methods — no import of the full class.
 */
export interface SynapticGraph {
  getAllNodes(): Node[];
  addEdge(edge: Edge): Edge;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a text string into a normalised set of meaningful tokens.
 *
 * - Splits camelCase / PascalCase boundaries before lowercasing
 * - Splits on whitespace and common punctuation
 * - Filters tokens shorter than 2 chars
 * - Removes stop-words
 *
 * @example
 * tokenize("TypeScript generics") → Set { "typescript", "generics" }
 * tokenize("useContextManager")   → Set { "context", "manager" }
 */
export function tokenize(text: string): Set<string> {
  // Split camelCase: "useContext" → "use Context"
  const expanded = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  const tokens = expanded
    .toLowerCase()
    .split(/[\s\-_/\\.,;:()[\]{}'"!?@#$%^&*+=<>|~`]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  return new Set(tokens);
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * Jaccard similarity coefficient between two token sets.
 * Returns 0 when both sets are empty.
 *
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return intersectionSize / unionSize;
}

// ---------------------------------------------------------------------------
// SynapticEngine
// ---------------------------------------------------------------------------

/**
 * SynapticEngine — retroactive keyword-based linking between nodes.
 *
 * When a new node enters the graph, `linkRetroactively()` scans **all**
 * existing nodes — regardless of when they were created — and creates
 * RELATES edges wherever the Jaccard similarity between tokenised
 * labels/descriptions meets the configured threshold.
 *
 * This gives WeaveGraph its neuronal behaviour: new concepts automatically
 * form connections with historically relevant knowledge.
 *
 * Produced edges carry `metadata.synapse = true` so callers can distinguish
 * auto-generated synaptic edges from manually created ones.
 *
 * @example
 * ```ts
 * const engine = new SynapticEngine({ threshold: 0.72, maxConnections: 20 });
 *
 * // Inject into ContextGraphManager
 * graph.setSynapticEngine(engine);
 *
 * // From now on, every addNode() triggers retroactive linking automatically
 * graph.addNode(NodeBuilder.concept("TypeScript generics"));
 * ```
 */
export class SynapticEngine {
  private readonly threshold: number;
  private readonly maxConnections: number;

  constructor(options: SynapticOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  }

  /** Read-only view of the resolved configuration. */
  get config(): Required<SynapticOptions> {
    return { threshold: this.threshold, maxConnections: this.maxConnections };
  }

  /**
   * Scan all existing nodes in `graph` and create RELATES edges to `newNode`
   * wherever the Jaccard similarity between their tokenised text meets the
   * threshold. At most `maxConnections` edges are created, selecting the
   * highest-similarity candidates first.
   *
   * The new node itself **must already exist** in the graph before calling
   * this method (so that `addEdge` can reference a valid node id).
   *
   * @returns The list of synaptic edges created and added to the graph.
   */
  linkRetroactively(newNode: Node, graph: SynapticGraph): Edge[] {
    const existing = graph.getAllNodes().filter((n) => n.id !== newNode.id);
    if (existing.length === 0) return [];

    const newTokens = tokenize(this._nodeText(newNode));
    if (newTokens.size === 0) return [];

    // Score every existing node
    const candidates: Array<{ node: Node; score: number }> = [];
    for (const node of existing) {
      const tokens = tokenize(this._nodeText(node));
      const score = jaccardSimilarity(newTokens, tokens);
      if (score >= this.threshold) {
        candidates.push({ node, score });
      }
    }

    // Select top-maxConnections by descending similarity
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates.slice(0, this.maxConnections);

    const created: Edge[] = [];
    for (const { node, score } of selected) {
      const base = EdgeBuilder.relates(newNode.id, node.id, score);
      const synapticEdge: Edge = {
        ...base,
        weight: score,
        metadata: { synapse: true, similarity: score },
      };
      graph.addEdge(synapticEdge);
      created.push(synapticEdge);
    }

    return created;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Combine label + description into a single text fingerprint for a node. */
  private _nodeText(node: Node): string {
    return [node.label, node.description ?? ""].join(" ");
  }
}
