/**
 * Relationship Detector — M7: Automatic Context Grafization
 *
 * Detects semantic relationships between extracted entities from raw text.
 * Uses keyword-pattern matching and co-occurrence proximity to classify
 * relationships into WeaveGraph EdgeTypes.
 */

import { ExtractedEntity } from './entity-extractor';

export type ExtractableEdgeType =
  | 'RELATES'
  | 'CAUSES'
  | 'CORRECTS'
  | 'IMPLEMENTS'
  | 'DEPENDS_ON'
  | 'BLOCKS';

export interface DetectedRelationship {
  sourceText: string;
  targetText: string;
  edgeType: ExtractableEdgeType;
  confidence: number; // 0.0 – 1.0
  evidence: string; // The text pattern that triggered this detection
  bidirectional: boolean;
}

export interface RelationshipDetectionConfig {
  minConfidence: number;
  maxRelationshipsPerEntity: number;
  coOccurrenceWindowChars: number; // Distance in chars for co-occurrence check
  enableBidirectional: boolean;
}

// ──────────────────────────────────────────────────────────
// Keyword patterns for each edge type
// ──────────────────────────────────────────────────────────

interface PatternRule {
  patterns: RegExp[];
  edgeType: ExtractableEdgeType;
  confidence: number;
  bidirectional: boolean;
}

const RELATIONSHIP_RULES: PatternRule[] = [
  {
    edgeType: 'CORRECTS',
    confidence: 0.85,
    bidirectional: false,
    patterns: [
      /\bfix(?:es|ed)?\b/i,
      /\bcorrect(?:s|ed)?\b/i,
      /\bresolve(?:s|d)?\b/i,
      /\bpatch(?:es|ed)?\b/i,
      /\bworkaround\b/i,
      /\bhotfix\b/i,
    ],
  },
  {
    edgeType: 'CAUSES',
    confidence: 0.8,
    bidirectional: false,
    patterns: [
      /\bcause(?:s|d)?\b/i,
      /\blead(?:s)?(?:\s+to)?\b/i,
      /\bresult(?:s|ed)?(?:\s+in)?\b/i,
      /\btrigger(?:s|ed)?\b/i,
      /\binduce(?:s|d)?\b/i,
      /\bbreak(?:s)?\b/i,
    ],
  },
  {
    edgeType: 'IMPLEMENTS',
    confidence: 0.8,
    bidirectional: false,
    patterns: [
      /\bimplement(?:s|ed)?\b/i,
      /\bextend(?:s|ed)?\b/i,
      /\binherit(?:s|ed)?\b/i,
      /\boverride(?:s|d)?\b/i,
      /\bwrap(?:s|ped)?\b/i,
    ],
  },
  {
    edgeType: 'DEPENDS_ON',
    confidence: 0.75,
    bidirectional: false,
    patterns: [
      /\bdepend(?:s|ed)?(?:\s+on)?\b/i,
      /\brequire(?:s|d)?\b/i,
      /\buse(?:s|d)?\b/i,
      /\bneeds?\b/i,
      /\bimport(?:s|ed)?\b/i,
      /\bcall(?:s|ed)?\b/i,
      /\binvoke(?:s|d)?\b/i,
    ],
  },
  {
    edgeType: 'BLOCKS',
    confidence: 0.8,
    bidirectional: false,
    patterns: [
      /\bblock(?:s|ed)?\b/i,
      /\bprevent(?:s|ed)?\b/i,
      /\bobstruct(?:s|ed)?\b/i,
      /\bstop(?:s|ped)?\b/i,
      /\bimpede(?:s|d)?\b/i,
    ],
  },
  {
    edgeType: 'RELATES',
    confidence: 0.4,
    bidirectional: true,
    patterns: [
      /\brelate(?:s|d)?(?:\s+to)?\b/i,
      /\bconnect(?:s|ed)?(?:\s+to)?\b/i,
      /\bassociat(?:es|ed)?(?:\s+with)?\b/i,
      /\blinked?(?:\s+to|with)?\b/i,
      /\bsimilar(?:\s+to)?\b/i,
    ],
  },
];

// ──────────────────────────────────────────────────────────
// Relationship Detector
// ──────────────────────────────────────────────────────────

export class RelationshipDetector {
  private config: RelationshipDetectionConfig;

  constructor(config?: Partial<RelationshipDetectionConfig>) {
    this.config = {
      minConfidence: 0.3,
      maxRelationshipsPerEntity: 5,
      coOccurrenceWindowChars: 200,
      enableBidirectional: true,
      ...config,
    };
  }

  /**
   * Detect relationships between all pairs of extracted entities in the text.
   */
  detect(text: string, entities: ExtractedEntity[]): DetectedRelationship[] {
    const relationships: DetectedRelationship[] = [];
    const entityTexts = entities.map(e => e.text);

    // Count relationships emitted per entity to respect the cap
    const entityRelCount = new Map<string, number>();

    for (let i = 0; i < entityTexts.length; i++) {
      for (let j = 0; j < entityTexts.length; j++) {
        if (i === j) continue;

        const src = entityTexts[i];
        const tgt = entityTexts[j];

        const srcCount = entityRelCount.get(src) ?? 0;
        if (srcCount >= this.config.maxRelationshipsPerEntity) continue;

        const rel = this.detectBetween(text, src, tgt);
        if (rel && rel.confidence >= this.config.minConfidence) {
          relationships.push(rel);
          entityRelCount.set(src, srcCount + 1);
        }
      }
    }

    // Deduplicate: keep highest-confidence pair for each (src, tgt)
    return this.deduplicate(relationships);
  }

  /**
   * Detect the strongest relationship between two specific entities in text.
   * Returns null if no relationship is found above threshold.
   */
  detectBetween(
    text: string,
    sourceText: string,
    targetText: string
  ): DetectedRelationship | null {
    const windows = this.extractCoOccurrenceWindows(text, sourceText, targetText);
    if (windows.length === 0) return null;

    let best: DetectedRelationship | null = null;

    for (const window of windows) {
      const rel = this.classifyWindow(window, sourceText, targetText);
      if (rel && (!best || rel.confidence > best.confidence)) {
        best = rel;
      }
    }

    // Fallback: co-occurrence with no explicit keyword → RELATES
    if (!best) {
      best = {
        sourceText,
        targetText,
        edgeType: 'RELATES',
        confidence: this.calculateCoOccurrenceConfidence(windows[0], sourceText),
        evidence: `co-occurrence within ${this.config.coOccurrenceWindowChars} chars`,
        bidirectional: true,
      };
    }

    return best;
  }

  // ── private ──────────────────────────────────────────────

  /**
   * Extract text windows where both entities co-occur.
   */
  private extractCoOccurrenceWindows(
    text: string,
    a: string,
    b: string
  ): string[] {
    const windows: string[] = [];
    const half = this.config.coOccurrenceWindowChars;

    let idx = 0;
    while (idx < text.length) {
      const posA = text.indexOf(a, idx);
      if (posA === -1) break;

      const windowStart = Math.max(0, posA - half);
      const windowEnd = Math.min(text.length, posA + a.length + half);
      const window = text.slice(windowStart, windowEnd);

      if (window.includes(b)) {
        windows.push(window);
      }

      idx = posA + 1;
    }

    return windows;
  }

  /**
   * Find the best matching rule in the window text.
   */
  private classifyWindow(
    window: string,
    sourceText: string,
    targetText: string
  ): DetectedRelationship | null {
    for (const rule of RELATIONSHIP_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(window)) {
          // Check that src appears before the keyword (and tgt after),
          // or that both just appear in the same window.
          const srcIdx = window.indexOf(sourceText);
          const tgtIdx = window.indexOf(targetText);
          if (srcIdx === -1 || tgtIdx === -1) continue;

          const matchResult = window.match(pattern);
          const keywordIdx = matchResult ? window.indexOf(matchResult[0]) : -1;

          // For directed relations, source should precede the keyword
          const directed = !rule.bidirectional;
          if (directed && keywordIdx !== -1) {
            if (srcIdx > keywordIdx) continue; // keyword before source — wrong direction
          }

          const proximity = 1 - Math.abs(srcIdx - tgtIdx) / window.length;
          const confidence = Math.min(1.0, rule.confidence + proximity * 0.1);

          return {
            sourceText,
            targetText,
            edgeType: rule.edgeType,
            confidence,
            evidence: matchResult ? matchResult[0] : window.slice(0, 50),
            bidirectional: rule.bidirectional,
          };
        }
      }
    }
    return null;
  }

  /**
   * Base confidence for a pure co-occurrence (no explicit keyword).
   * Shorter distance = higher confidence.
   */
  private calculateCoOccurrenceConfidence(window: string, sourceText: string): number {
    const srcIdx = window.indexOf(sourceText);
    if (srcIdx === -1) return 0.3;

    const proximity = 1 - srcIdx / window.length;
    return Math.max(0.3, Math.min(0.55, 0.3 + proximity * 0.25));
  }

  /**
   * Keep only the highest-confidence relationship for each (src, tgt) pair.
   */
  private deduplicate(rels: DetectedRelationship[]): DetectedRelationship[] {
    const seen = new Map<string, DetectedRelationship>();

    for (const rel of rels) {
      const key = `${rel.sourceText}→${rel.targetText}`;
      const existing = seen.get(key);
      if (!existing || rel.confidence > existing.confidence) {
        seen.set(key, rel);
      }
    }

    return Array.from(seen.values());
  }

  /** Get current config */
  getConfig(): RelationshipDetectionConfig {
    return { ...this.config };
  }
}
