/**
 * @openweave/agent-core
 * Public API surface
 */

// Types
export * from './types.js';

// Core modules
export { AgentCore } from './agent-core.js';
export { SystemPromptBuilder, OPENWEAVE_BASE_PROMPT } from './system-prompt.js';
export type { GraphContextSection } from './system-prompt.js';
export { ToolRegistry, BUILTIN_TOOLS } from './tool-registry.js';
export { ContextManager, DEFAULT_COMPRESSION_POLICY } from './context-manager.js';
export { SessionLifecycle } from './session-lifecycle.js';

export const version = '0.1.0';
