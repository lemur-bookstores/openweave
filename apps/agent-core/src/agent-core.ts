/**
 * AgentCore
 *
 * The central OpenWeave ReAct agent.
 *
 * Architecture:
 *   ┌─────────────────────────────────────┐
 *   │               AgentCore             │
 *   │                                     │
 *   │  ContextManager  ←→  message window │
 *   │  ToolRegistry    ←→  tool dispatch  │
 *   │  SessionLifecycle←→  persistence    │
 *   │  SystemPromptBuilder → system msg   │
 *   │                                     │
 *   │  ReAct loop:                        │
 *   │    1. LLM complete(messages, tools) │
 *   │    2. If tool_call → execute → obs  │
 *   │    3. If plain text → return answer │
 *   └─────────────────────────────────────┘
 *
 * The `LLMClient` is injected so tests can supply a mock without
 * making real network calls.
 */

import {
  AgentConfig,
  AgentMessage,
  AgentTurnResult,
  AgentRunOptions,
  AgentEvent,
  AgentEventHandler,
  LLMClient,
  SessionInfo,
  StopReason,
  ToolResult,
  TokenUsage,
} from './types.js';
import { SystemPromptBuilder } from './system-prompt.js';
import { ToolRegistry } from './tool-registry.js';
import { ContextManager } from './context-manager.js';
import { SessionLifecycle } from './session-lifecycle.js';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${rand}`;
}

// ──────────────────────────────────────────────────────────
// AgentCore
// ──────────────────────────────────────────────────────────

export class AgentCore {
  private config: Required<AgentConfig>;
  private llmClient: LLMClient;

  private promptBuilder: SystemPromptBuilder;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager;
  private lifecycle: SessionLifecycle;

  private session: SessionInfo | null = null;
  private messages: AgentMessage[] = [];
  private eventHandlers: AgentEventHandler[] = [];

  constructor(llmClient: LLMClient, config: AgentConfig = {}) {
    this.llmClient = llmClient;

    // Normalise config with defaults
    this.config = {
      sessionId: config.sessionId ?? generateId('sess'),
      chatId: config.chatId ?? generateId('chat'),
      persistenceDir: config.persistenceDir ?? '.weave-sessions',
      llm: {
        provider: config.llm?.provider ?? 'mock',
        model: config.llm?.model ?? 'gpt-4o',
        baseUrl: config.llm?.baseUrl ?? '',
        apiKey: config.llm?.apiKey ?? '',
        maxTokens: config.llm?.maxTokens ?? 1024,
        temperature: config.llm?.temperature ?? 0.2,
      },
      compression: {
        maxWindowTokens: config.compression?.maxWindowTokens ?? 8_192,
        compressionThreshold: config.compression?.compressionThreshold ?? 0.75,
        charsPerToken: config.compression?.charsPerToken ?? 4,
      },
      run: {
        maxTurns: config.run?.maxTurns ?? 10,
        verbose: config.run?.verbose ?? false,
      },
    };

    this.promptBuilder = new SystemPromptBuilder();
    this.toolRegistry = new ToolRegistry();
    this.contextManager = new ContextManager(this.config.compression);
    this.lifecycle = new SessionLifecycle(this.config.persistenceDir);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Initialise the session (creates or resumes persisted state).
   * Must be called before `run()`.
   */
  async init(): Promise<SessionInfo> {
    this.session = this.lifecycle.init(this.config.sessionId, this.config.chatId);

    // Build initial system prompt
    const systemPrompt = this.promptBuilder.build({ session: this.session });
    this.messages = [{ role: 'system', content: systemPrompt }];

    this.emit({ type: 'session:started', payload: { session: this.session } });

    return this.session;
  }

  /**
   * Run a single user turn through the ReAct loop.
   */
  async run(userMessage: string, options: AgentRunOptions = {}): Promise<AgentTurnResult> {
    if (!this.session) {
      throw new Error('AgentCore: call init() before run().');
    }

    const maxTurns = options.maxTurns ?? this.config.run.maxTurns ?? 10;
    const verbose = options.verbose ?? this.config.run.verbose ?? false;

    this.emit({ type: 'turn:start', payload: { userMessage } });

    // Append user message to window
    this.messages.push({ role: 'user', content: userMessage });

    const toolResults: ToolResult[] = [];
    let iterations = 0;
    let stopReason: StopReason = 'no_tool_call';
    let finalOutput = '';

    while (iterations < maxTurns) {
      // Check compression
      if (this.contextManager.shouldCompress(this.messages)) {
        this.messages = this.contextManager.compress(this.messages);
        this.session = this.lifecycle.recordCompression(this.session);
        this.emit({ type: 'context:compressed', payload: { iteration: iterations } });
      }

      // Call LLM
      const assistantMsg = await this.llmClient.complete(
        this.messages,
        this.toolRegistry.listDefinitions()
      );

      this.messages.push(assistantMsg);
      iterations++;

      if (verbose) {
        console.log(`[AgentCore] iteration=${iterations} role=${assistantMsg.role}`);
      }

      // No tool call → final answer
      if (!assistantMsg.toolCall) {
        finalOutput = assistantMsg.content;
        stopReason = 'no_tool_call';
        break;
      }

      // Execute tool
      const call = assistantMsg.toolCall;
      this.emit({ type: 'tool:call', payload: { call } });

      const result = await this.toolRegistry.execute(call, {
        sessionId: this.session.sessionId,
        chatId: this.session.chatId,
        turnIndex: iterations,
      });

      toolResults.push(result);
      this.emit({ type: 'tool:result', payload: { result } });

      // Check for stop signal from tool
      const output = result.output as Record<string, unknown> | null;
      if (output && typeof output === 'object' && output['stop'] === true) {
        finalOutput = assistantMsg.content;
        stopReason = 'stop_signal';
        break;
      }

      // Append observation
      const observation = result.isError
        ? `Tool error: ${result.errorMessage}`
        : JSON.stringify(result.output);

      this.messages.push({
        role: 'tool',
        content: observation,
        toolCallId: call.id,
      });

      if (iterations >= maxTurns) {
        finalOutput = assistantMsg.content;
        stopReason = 'max_turns_reached';
      }
    }

    // Update session record
    this.session = this.lifecycle.recordTurn(this.session, toolResults.length);

    const tokenUsage: TokenUsage = this.contextManager.getUsage(this.messages);

    const turnResult: AgentTurnResult = {
      output: finalOutput,
      stopReason,
      toolResults,
      iterations,
      tokenUsage,
    };

    this.emit({ type: 'turn:end', payload: { turnResult } });

    return turnResult;
  }

  /**
   * Gracefully close the session and flush state.
   */
  async close(): Promise<void> {
    if (!this.session) return;
    this.session = this.lifecycle.close(this.session);
    this.emit({ type: 'session:closed', payload: { session: this.session } });
    this.session = null;
  }

  // ── Accessors ──────────────────────────────────────────────

  getSession(): SessionInfo | null {
    return this.session;
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getSessionLifecycle(): SessionLifecycle {
    return this.lifecycle;
  }

  // ── Events ─────────────────────────────────────────────────

  on(handler: AgentEventHandler): void {
    this.eventHandlers.push(handler);
  }

  off(handler: AgentEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  private emit(partial: Omit<AgentEvent, 'sessionId' | 'timestamp'>): void {
    const event: AgentEvent = {
      ...partial,
      sessionId: this.session?.sessionId ?? this.config.sessionId,
      timestamp: new Date().toISOString(),
    };
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Event handlers must not crash the loop
      }
    }
  }
}
