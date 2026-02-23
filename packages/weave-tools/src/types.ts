/**
 * WeaveTools — Type Definitions (M24)
 *
 * Core contracts for the External Tool Registry & Adapters system.
 * A ToolManifest describes any external tool; adapters route calls to the right backend.
 */

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

/** Transport mechanism used to reach the external tool. */
export type AdapterType = 'http' | 'mcp' | 'script';

/** Authentication strategies for HTTP/MCP adapters. */
export type AuthType = 'bearer' | 'api-key' | 'basic' | 'none';

export interface ToolAuth {
  type: AuthType;
  /** Name of the environment variable holding the credential */
  envVar?: string;
  /** HTTP header name for api-key auth (default: 'X-API-Key') */
  headerName?: string;
}

// ---------------------------------------------------------------------------
// Tool schema (subset of JSON Schema)
// ---------------------------------------------------------------------------

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: unknown[] }>;
  required?: string[];
}

/** A single callable action within an external tool manifest. */
export interface ToolAction {
  /** Matches the MCP tool name / HTTP action path */
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

// ---------------------------------------------------------------------------
// ToolManifest — the .weave/tools/<name>.tool.json descriptor
// ---------------------------------------------------------------------------

export interface ToolManifest {
  /** Unique identifier, used as prefix: `<id>__<action>` */
  id: string;
  name: string;
  description: string;
  version: string;
  adapter: AdapterType;

  // HTTP / MCP adapter options
  endpoint?: string;
  auth?: ToolAuth;

  // Script adapter options
  /** Path to executable script (relative to project root) */
  scriptPath?: string;
  /** Extra environment variables to pass to the script */
  scriptEnv?: Record<string, string>;

  /** Timeout in milliseconds (default: 10 000) */
  timeout_ms?: number;

  tools: ToolAction[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;

  if (!m['id'] || typeof m['id'] !== 'string') errors.push('Missing required field: id (string)');
  if (!m['name'] || typeof m['name'] !== 'string') errors.push('Missing required field: name (string)');
  if (!m['description'] || typeof m['description'] !== 'string') errors.push('Missing required field: description (string)');
  if (!m['version'] || typeof m['version'] !== 'string') errors.push('Missing required field: version (string)');

  const validAdapters: AdapterType[] = ['http', 'mcp', 'script'];
  if (!validAdapters.includes(m['adapter'] as AdapterType)) {
    errors.push(`Invalid adapter "${m['adapter']}" — must be one of: ${validAdapters.join(', ')}`);
  }

  if (m['adapter'] === 'http' || m['adapter'] === 'mcp') {
    if (!m['endpoint'] || typeof m['endpoint'] !== 'string') {
      errors.push('HTTP/MCP adapter requires endpoint (string)');
    }
  }

  if (m['adapter'] === 'script') {
    if (!m['scriptPath'] || typeof m['scriptPath'] !== 'string') {
      errors.push('Script adapter requires scriptPath (string)');
    }
  }

  if (!Array.isArray(m['tools'])) {
    errors.push('Missing required field: tools (array)');
  } else if ((m['tools'] as unknown[]).length === 0) {
    errors.push('tools array must contain at least one action');
  } else {
    for (const t of m['tools'] as unknown[]) {
      const tool = t as Record<string, unknown>;
      if (!tool['name']) errors.push(`Tool action missing "name" field`);
      if (!tool['description']) errors.push(`Tool action "${tool['name']}" missing "description"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Runtime types
// ---------------------------------------------------------------------------

/** Result of invoking a single tool action. */
export interface ToolCallResult {
  toolId: string;
  action: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

/** Internal handler function registered in the tool registry for each action. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>;

/** A registered external tool with its resolved handler. */
export interface RegisteredExternalTool {
  manifest: ToolManifest;
  /** Prefixed action names: `<id>__<action>` */
  actionNames: string[];
  handlers: Map<string, ToolHandler>;
  registeredAt: string;
}
