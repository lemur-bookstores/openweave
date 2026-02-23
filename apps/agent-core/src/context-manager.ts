/**
 * ContextManager
 *
 * Tracks token budget for the active context window.
 * Uses a lightweight character-based estimation (no tokenizer dep).
 *
 * When utilisation exceeds `compressionThreshold`, the manager
 * signals that the agent loop should archive low-frequency nodes
 * via WeaveGraph's compression engine.
 */

import { AgentMessage, CompressionPolicy, TokenUsage } from './types.js';

// ──────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────

export const DEFAULT_COMPRESSION_POLICY: Required<CompressionPolicy> = {
  maxWindowTokens: 8_192,
  compressionThreshold: 0.75,
  charsPerToken: 4,
};

// ──────────────────────────────────────────────────────────
// ContextManager
// ──────────────────────────────────────────────────────────

export class ContextManager {
  private policy: Required<CompressionPolicy>;
  private archivedTokens: number = 0;
  private compressionCount: number = 0;

  constructor(policy?: Partial<CompressionPolicy>) {
    this.policy = {
      ...DEFAULT_COMPRESSION_POLICY,
      ...policy,
    };
  }

  // ── Token estimation ──────────────────────────────────────

  /**
   * Estimate tokens for a single string.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.policy.charsPerToken);
  }

  /**
   * Estimate tokens across an array of messages.
   */
  estimateMessageTokens(messages: AgentMessage[]): number {
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  }

  // ── Budget tracking ───────────────────────────────────────

  /**
   * Snapshot current token usage given the live message window.
   */
  getUsage(messages: AgentMessage[]): TokenUsage {
    const windowTokens = this.estimateMessageTokens(messages);
    const totalTokens = windowTokens + this.archivedTokens;
    const utilisation = windowTokens / this.policy.maxWindowTokens;
    return { windowTokens, archivedTokens: this.archivedTokens, totalTokens, utilisation };
  }

  /**
   * Returns true when the window has consumed enough of the budget
   * that compression should be triggered.
   */
  shouldCompress(messages: AgentMessage[]): boolean {
    const { utilisation } = this.getUsage(messages);
    return utilisation >= this.policy.compressionThreshold;
  }

  /**
   * Compress the message window: keep the system prompt + last N messages,
   * add archived tokens to the ledger, and return the trimmed window.
   *
   * @param messages  Full message array (system prompt MUST be index 0)
   * @param keepLast  Number of tail messages to retain (default: 6)
   */
  compress(messages: AgentMessage[], keepLast = 6): AgentMessage[] {
    if (messages.length <= keepLast + 1) return messages; // +1 for system

    const systemMessage = messages[0]!;
    const tail = messages.slice(-keepLast);
    const archived = messages.slice(1, messages.length - keepLast);

    // Accumulate compressed tokens
    const archivedEstimate = this.estimateMessageTokens(archived);
    this.archivedTokens += archivedEstimate;
    this.compressionCount++;

    return [systemMessage, ...tail];
  }

  // ── Policy access ─────────────────────────────────────────

  getPolicy(): Required<CompressionPolicy> {
    return { ...this.policy };
  }

  getCompressionCount(): number {
    return this.compressionCount;
  }

  getArchivedTokens(): number {
    return this.archivedTokens;
  }

  /** Reset archived ledger (e.g. when a new session starts). */
  reset(): void {
    this.archivedTokens = 0;
    this.compressionCount = 0;
  }
}
