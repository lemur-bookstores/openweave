/**
 * AgentCore — Shared Type Definitions
 *
 * All types are self-contained so the module can be consumed
 * independently of the runtime LLM provider.
 */

// ──────────────────────────────────────────────────────────
// LLM Provider & Message shapes
// ──────────────────────────────────────────────────────────

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'mock';

export interface AgentMessage {
  role: LLMRole;
  content: string;
  /** Present when role === 'tool' */
  toolCallId?: string;
  /** Present when the assistant emits a tool call */
  toolCall?: PendingToolCall;
}

/** A tool invocation requested by the LLM */
export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Result returned after executing a tool */
export interface ToolResult {
  toolCallId: string;
  name: string;
  output: unknown;
  /** True if execution threw */
  isError: boolean;
  /** Serialized error message (if isError) */
  errorMessage?: string;
  executedAt: string; // ISO
}

// ──────────────────────────────────────────────────────────
// Token budget & context window
// ──────────────────────────────────────────────────────────

export interface TokenUsage {
  /** Tokens estimated for messages in the current window */
  windowTokens: number;
  /** Tokens in the compressed / archived portion */
  archivedTokens: number;
  /** Sum of windowTokens + archivedTokens */
  totalTokens: number;
  /** Fraction 0-1 of budget consumed */
  utilisation: number;
}

export interface CompressionPolicy {
  /** Token budget cap for the context window (default: 8 192) */
  maxWindowTokens: number;
  /** Compression triggers at this utilisation fraction (default: 0.75) */
  compressionThreshold: number;
  /** Chars-per-token approximation for lightweight estimation (default: 4) */
  charsPerToken: number;
}

// ──────────────────────────────────────────────────────────
// Session
// ──────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'idle' | 'closed';

export interface SessionInfo {
  sessionId: string;
  chatId: string;
  startedAt: string; // ISO
  lastActiveAt: string; // ISO
  status: SessionStatus;
  /** Total turns executed so far */
  turnCount: number;
  /** Total tool calls across all turns */
  toolCallCount: number;
  /** Number of compressions triggered */
  compressionCount: number;
}

// ──────────────────────────────────────────────────────────
// Tool registry
// ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Whether results should be included verbatim in the next observation */
  includeInContext?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<unknown>;

export interface ToolExecutionContext {
  sessionId: string;
  chatId: string;
  turnIndex: number;
}

// ──────────────────────────────────────────────────────────
// Agent run loop
// ──────────────────────────────────────────────────────────

export type StopReason =
  | 'max_turns_reached'
  | 'no_tool_call'       // LLM returned a plain text answer
  | 'stop_signal'        // tool returned { stop: true }
  | 'error';

export interface AgentRunOptions {
  /** Hard limit on ReAct iterations per user turn (default: 10) */
  maxTurns?: number;
  /** If true, emits verbose step-by-step logs */
  verbose?: boolean;
}

export interface AgentTurnResult {
  /** Final assistant response text */
  output: string;
  /** How the loop ended */
  stopReason: StopReason;
  /** Tool calls executed during this turn */
  toolResults: ToolResult[];
  /** Number of ReAct iterations used */
  iterations: number;
  /** Token usage snapshot at end of turn */
  tokenUsage: TokenUsage;
}

// ──────────────────────────────────────────────────────────
// Agent configuration
// ──────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Unique session identifier (default: random UUID-v4 prefix) */
  sessionId?: string;
  /** Chat / conversation identifier forwarded to WeaveGraph */
  chatId?: string;
  /** Directory for session persistence (default: .weave-sessions/) */
  persistenceDir?: string;
  llm?: {
    provider?: LLMProvider;
    model?: string;
    /** Base URL for self-hosted providers (ollama, openai-compatible) */
    baseUrl?: string;
    apiKey?: string;
    /** Max tokens for LLM completions (default: 1024) */
    maxTokens?: number;
    temperature?: number;
  };
  compression?: Partial<CompressionPolicy>;
  run?: AgentRunOptions;
}

// ──────────────────────────────────────────────────────────
// LLM Client interface (injectable for tests)
// ──────────────────────────────────────────────────────────

export interface LLMClient {
  /** Send messages and return the next assistant message */
  complete(
    messages: AgentMessage[],
    tools: ToolDefinition[]
  ): Promise<AgentMessage>;
}

// ──────────────────────────────────────────────────────────
// Events emitted by AgentCore
// ──────────────────────────────────────────────────────────

export type AgentEventType =
  | 'session:started'
  | 'session:closed'
  | 'turn:start'
  | 'turn:end'
  | 'tool:call'
  | 'tool:result'
  | 'context:compressed';

export interface AgentEvent {
  type: AgentEventType;
  sessionId: string;
  timestamp: string; // ISO
  payload?: unknown;
}

export type AgentEventHandler = (event: AgentEvent) => void;
