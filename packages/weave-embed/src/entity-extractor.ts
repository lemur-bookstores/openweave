/**
 * Entity Extractor — M7: Automatic Context Grafization
 *
 * Extracts entities from raw text without requiring an LLM API.
 * Uses pattern-matching, NLP heuristics, and frequency analysis
 * to classify entities into WeaveGraph NodeTypes.
 */

export type ExtractableNodeType =
  | 'CONCEPT'
  | 'DECISION'
  | 'ERROR'
  | 'CORRECTION'
  | 'CODE_ENTITY'
  | 'MILESTONE';

export interface ExtractedEntity {
  text: string;
  normalizedText: string;
  nodeType: ExtractableNodeType;
  frequency: number;
  confidence: number; // 0.0 – 1.0
  contexts: string[]; // Surrounding sentence snippets
  metadata?: Record<string, unknown>;
}

export interface EntityExtractionConfig {
  minFrequency: number; // Min occurrences to be included
  minConfidence: number; // Min confidence threshold
  maxEntities: number; // Cap on entities returned
  includeCodeEntities: boolean; // Include camelCase/PascalCase identifiers
  contextWindowChars: number; // Chars of context to capture per mention
}

// ──────────────────────────────────────────────────────────
// Keyword sets for classification
// ──────────────────────────────────────────────────────────

const DECISION_KEYWORDS = new Set([
  'decided', 'decision', 'chose', 'choose', 'selected', 'select',
  'opted', 'option', 'approach', 'strategy', 'pick', 'picked',
  'prefer', 'preferred', 'solution', 'resolve', 'resolved',
]);

const ERROR_KEYWORDS = new Set([
  'error', 'bug', 'crash', 'exception', 'fail', 'failed', 'failure',
  'issue', 'problem', 'broken', 'undefined', 'null', 'nan', 'typo',
  'mistake', 'wrong', 'incorrect', 'invalid', 'corrupt',
]);

const CORRECTION_KEYWORDS = new Set([
  'fix', 'fixed', 'fixes', 'correct', 'corrected', 'corrects',
  'patch', 'patched', 'resolved', 'resolve', 'workaround', 'hotfix',
  'refactor', 'refactored', 'improve', 'improved',
]);

const MILESTONE_KEYWORDS = new Set([
  'milestone', 'phase', 'sprint', 'release', 'version', 'v0.',
  'v1.', 'v2.', 'deploy', 'deployment', 'launch', 'ship', 'shipped',
  'complete', 'completed', 'done', 'finish', 'finished',
]);

/** Stop words that should never become entities */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'it', 'its', 'this', 'that',
  'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'my', 'your',
  'our', 'their', 'so', 'if', 'then', 'when', 'where', 'which', 'who',
  'what', 'how', 'not', 'no', 'yes', 'also', 'just', 'only', 'very',
  'can', 'than',
]);

// ──────────────────────────────────────────────────────────
// Regex patterns
// ──────────────────────────────────────────────────────────

/** PascalCase: React, MyClass, WeaveGraph */
const PASCAL_CASE_RE = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;
/** camelCase: myFunction, queryGraph */
const CAMEL_CASE_RE = /\b[a-z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]+)+\b/g;
/** UPPER_SNAKE_CASE: NODE_TYPE, MAX_LIMIT */
const UPPER_SNAKE_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
/** Backtick-quoted code: `saveGraph`, `chat_id` */
const BACKTICK_RE = /`([^`\n]{2,60})`/g;
/** Quoted strings that look like identifiers */
const QUOTED_IDENT_RE = /"([A-Za-z][A-Za-z0-9_\- ]{1,40})"|'([A-Za-z][A-Za-z0-9_\- ]{1,40})'/g;
/** Capitalized noun phrases (Title Case, 1-3 words) */
const TITLE_CASE_RE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g;

// ──────────────────────────────────────────────────────────
// Entity Extractor
// ──────────────────────────────────────────────────────────

export class EntityExtractor {
  private config: EntityExtractionConfig;

  constructor(config?: Partial<EntityExtractionConfig>) {
    this.config = {
      minFrequency: 1,
      minConfidence: 0.25,
      maxEntities: 50,
      includeCodeEntities: true,
      contextWindowChars: 120,
      ...config,
    };
  }

  /**
   * Main extraction entry point.
   * Given raw text, returns ranked, deduplicated entities.
   */
  extract(text: string): ExtractedEntity[] {
    const sentences = this.splitSentences(text);
    const rawHits = new Map<string, { count: number; type: ExtractableNodeType; contexts: Set<string>; metadata: Record<string, unknown> }>();

    for (const sentence of sentences) {
      this.extractFromSentence(sentence, text, rawHits);
    }

    const entities: ExtractedEntity[] = [];

    for (const [normalized, hit] of rawHits) {
      if (hit.count < this.config.minFrequency) continue;

      const confidence = this.calculateConfidence(normalized, hit.count, hit.type, text);
      if (confidence < this.config.minConfidence) continue;

      entities.push({
        text: normalized,
        normalizedText: normalized.toLowerCase(),
        nodeType: hit.type,
        frequency: hit.count,
        confidence,
        contexts: Array.from(hit.contexts).slice(0, 3),
        metadata: hit.metadata,
      });
    }

    // Sort: confidence × log(frequency) desc
    return entities
      .sort((a, b) => b.confidence * Math.log1p(b.frequency) - a.confidence * Math.log1p(a.frequency))
      .slice(0, this.config.maxEntities);
  }

  // ── private ──────────────────────────────────────────────

  private extractFromSentence(
    sentence: string,
    fullText: string,
    hits: Map<string, { count: number; type: ExtractableNodeType; contexts: Set<string>; metadata: Record<string, unknown> }>
  ): void {
    const senLower = sentence.toLowerCase();
    const sentenceType = this.classifySentenceContext(senLower);

    const addHit = (raw: string, type: ExtractableNodeType, meta?: Record<string, unknown>) => {
      const key = this.normalize(raw);
      if (!key || STOP_WORDS.has(key.toLowerCase()) || key.length < 2) return;

      const ctx = this.extractContext(fullText, raw);
      if (hits.has(key)) {
        const existing = hits.get(key)!;
        existing.count++;
        if (ctx) existing.contexts.add(ctx);
        // Upgrade to more specific type if warranted
        if (this.typeRank(type) > this.typeRank(existing.type)) {
          existing.type = type;
        }
      } else {
        const contexts = new Set<string>();
        if (ctx) contexts.add(ctx);
        hits.set(key, { count: 1, type, contexts, metadata: meta ?? {} });
      }
    };

    // Backtick-quoted code (highest priority as explicit code entity)
    if (this.config.includeCodeEntities) {
      for (const match of sentence.matchAll(BACKTICK_RE)) {
        const inner = match[1];
        addHit(inner, sentenceType ?? 'CODE_ENTITY', { source: 'backtick' });
      }
    }

    // Quoted identifier strings
    for (const match of sentence.matchAll(QUOTED_IDENT_RE)) {
      const inner = match[1] ?? match[2];
      addHit(inner, sentenceType ?? 'CONCEPT', { source: 'quoted' });
    }

    // PascalCase identifiers
    if (this.config.includeCodeEntities) {
      for (const match of sentence.matchAll(PASCAL_CASE_RE)) {
        addHit(match[0], 'CODE_ENTITY', { source: 'pascal' });
      }
    }

    // camelCase identifiers
    if (this.config.includeCodeEntities) {
      for (const match of sentence.matchAll(CAMEL_CASE_RE)) {
        addHit(match[0], 'CODE_ENTITY', { source: 'camel' });
      }
    }

    // UPPER_SNAKE — usually constants / enum values
    if (this.config.includeCodeEntities) {
      for (const match of sentence.matchAll(UPPER_SNAKE_RE)) {
        addHit(match[0], 'CODE_ENTITY', { source: 'upper_snake' });
      }
    }

    // Title Case noun phrases
    for (const match of sentence.matchAll(TITLE_CASE_RE)) {
      const phrase = match[1];
      if (STOP_WORDS.has(phrase.toLowerCase())) continue;
      const nodeType = sentenceType ?? 'CONCEPT';
      addHit(phrase, nodeType, { source: 'title_case' });
    }

    // Keyword-triggered single-word technical terms
    const words = sentence.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9_\-]/g, '');
      if (clean.length < 3 || STOP_WORDS.has(clean.toLowerCase())) continue;
      if (sentenceType) {
        addHit(clean, sentenceType, { source: 'keyword_context' });
      }
    }
  }

  /**
   * Returns the dominant node type for a sentence based on keyword context,
   * or null if no strong signal is found.
   */
  private classifySentenceContext(senLower: string): ExtractableNodeType | null {
    const words = new Set(senLower.split(/\W+/));

    let decisionScore = 0;
    let errorScore = 0;
    let correctionScore = 0;
    let milestoneScore = 0;

    for (const w of words) {
      if (DECISION_KEYWORDS.has(w)) decisionScore++;
      if (ERROR_KEYWORDS.has(w)) errorScore++;
      if (CORRECTION_KEYWORDS.has(w)) correctionScore++;
      if (MILESTONE_KEYWORDS.has(w)) milestoneScore++;
    }

    const max = Math.max(decisionScore, errorScore, correctionScore, milestoneScore);
    if (max === 0) return null;
    if (max === correctionScore) return 'CORRECTION';
    if (max === errorScore) return 'ERROR';
    if (max === decisionScore) return 'DECISION';
    return 'MILESTONE';
  }

  /**
   * Confidence = base score × frequency boost × type specificity bonus
   */
  private calculateConfidence(
    text: string,
    frequency: number,
    type: ExtractableNodeType,
    fullText: string
  ): number {
    // Base: longer texts are more specific
    const lengthScore = Math.min(1, text.length / 20);

    // Frequency boost (diminishing returns)
    const freqScore = Math.min(1, Math.log1p(frequency) / Math.log1p(10));

    // Code-entity patterns boost
    const isPascal = /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(text);
    const isCamel = /^[a-z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]+)+$/.test(text);
    const isBacktick = fullText.includes(`\`${text}\``);
    const codeBoost = isBacktick ? 0.3 : isPascal || isCamel ? 0.2 : 0;

    // Type specificity bonus (non-generic types are more valuable)
    const typeBonus: Record<ExtractableNodeType, number> = {
      ERROR: 0.2,
      DECISION: 0.2,
      MILESTONE: 0.15,
      CORRECTION: 0.15,
      CODE_ENTITY: 0.1,
      CONCEPT: 0.05,
    };

    const raw = (lengthScore * 0.3) + (freqScore * 0.5) + codeBoost + typeBonus[type];
    return Math.min(1.0, raw);
  }

  /**
   * Extract a short context window around the first occurrence of `term` in `text`.
   */
  private extractContext(text: string, term: string): string | null {
    const idx = text.indexOf(term);
    if (idx === -1) return null;

    const half = Math.floor(this.config.contextWindowChars / 2);
    const start = Math.max(0, idx - half);
    const end = Math.min(text.length, idx + term.length + half);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  private normalize(text: string): string {
    return text.replace(/[`'"]/g, '').trim();
  }

  private splitSentences(text: string): string[] {
    // Split on sentence boundaries (., !, ?) and newlines
    return text
      .split(/(?<=[.!?\n])\s+|(?:\n{2,})/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /** Higher rank = more specific / more valuable type */
  private typeRank(type: ExtractableNodeType): number {
    const ranks: Record<ExtractableNodeType, number> = {
      ERROR: 5,
      DECISION: 4,
      CORRECTION: 4,
      MILESTONE: 3,
      CODE_ENTITY: 2,
      CONCEPT: 1,
    };
    return ranks[type];
  }

  /** Get current config */
  getConfig(): EntityExtractionConfig {
    return { ...this.config };
  }
}
