/**
 * WeaveTools — Unit Tests (M24)
 *
 * Coverage:
 *   - types / validateManifest      (10 tests)
 *   - http-adapter                  (8 tests)
 *   - mcp-adapter                   (6 tests)
 *   - script-adapter                (8 tests)
 *   - tool-loader                   (10 tests)
 *   - tool-store                    (10 tests)
 *   - tool-bridge                   (10 tests)
 *
 * Total: 62 tests
 *
 * All I/O is injected — no real network, FS, or process calls.
 */

import { describe, it, expect, vi } from 'vitest';

// Types
import {
  validateManifest,
  type ToolManifest,
} from './types.js';

// HTTP adapter
import {
  buildAuthHeaders,
  createHttpHandler,
  createHttpAdapter,
} from './adapters/http-adapter.js';

// MCP adapter
import { createMcpHandler } from './adapters/mcp-adapter.js';

// Script adapter
import { createScriptHandler, createScriptAdapter } from './adapters/script-adapter.js';

// Loader
import {
  loadManifestFile,
  loadLocalManifests,
  loadNpmManifests,
  type FsAdapter as LoaderFsAdapter,
} from './tool-loader.js';

// Store
import { ToolStore, type ToolStoreData } from './tool-store.js';

// Bridge
import { ExternalToolBridge } from './tool-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HTTP_MANIFEST: ToolManifest = {
  id: 'test-http',
  name: 'Test HTTP Tool',
  description: 'For unit tests',
  version: '1.0.0',
  adapter: 'http',
  endpoint: 'http://localhost:9999',
  auth: { type: 'bearer', envVar: 'TEST_TOKEN' },
  timeout_ms: 500,
  tools: [
    {
      name: 'greet',
      description: 'Greet someone',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
    {
      name: 'ping',
      description: 'Ping',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
};

const MCP_MANIFEST: ToolManifest = {
  id: 'test-mcp',
  name: 'Test MCP Tool',
  description: 'MCP server',
  version: '1.0.0',
  adapter: 'mcp',
  endpoint: 'http://localhost:8888',
  timeout_ms: 500,
  tools: [
    {
      name: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ],
};

const SCRIPT_MANIFEST: ToolManifest = {
  id: 'test-script',
  name: 'Test Script Tool',
  description: 'Script-based tool',
  version: '1.0.0',
  adapter: 'script',
  scriptPath: './scripts/my-tool.sh',
  timeout_ms: 500,
  tools: [
    {
      name: 'compute',
      description: 'Run computation',
      inputSchema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
    },
  ],
};

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('validates a complete HTTP manifest', () => {
    const result = validateManifest(HTTP_MANIFEST);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a complete script manifest', () => {
    const result = validateManifest(SCRIPT_MANIFEST);
    expect(result.valid).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateManifest('string').valid).toBe(false);
    expect(validateManifest(null).valid).toBe(false);
  });

  it('requires id, name, description, version', () => {
    const { errors } = validateManifest({ adapter: 'http', endpoint: 'x', tools: [{ name: 'a', description: 'b' }] });
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('rejects unknown adapter', () => {
    const { errors } = validateManifest({ ...HTTP_MANIFEST, adapter: 'ftp' });
    expect(errors.some((e) => e.includes('adapter'))).toBe(true);
  });

  it('requires endpoint for http adapter', () => {
    const { errors } = validateManifest({ ...HTTP_MANIFEST, endpoint: undefined });
    expect(errors.some((e) => e.includes('endpoint'))).toBe(true);
  });

  it('requires scriptPath for script adapter', () => {
    const { errors } = validateManifest({ ...SCRIPT_MANIFEST, scriptPath: undefined });
    expect(errors.some((e) => e.includes('scriptPath'))).toBe(true);
  });

  it('requires at least one tool action', () => {
    const { errors } = validateManifest({ ...HTTP_MANIFEST, tools: [] });
    expect(errors.some((e) => e.includes('tools'))).toBe(true);
  });

  it('validates tool action names', () => {
    const { errors } = validateManifest({ ...HTTP_MANIFEST, tools: [{ description: 'no name' }] });
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('accepts MCP manifest with endpoint', () => {
    const result = validateManifest(MCP_MANIFEST);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP Adapter
// ---------------------------------------------------------------------------

describe('http-adapter', () => {
  it('buildAuthHeaders bearer', () => {
    vi.stubEnv('TEST_TOKEN', 'my-secret');
    const headers = buildAuthHeaders({ type: 'bearer', envVar: 'TEST_TOKEN' });
    expect(headers['Authorization']).toBe('Bearer my-secret');
    vi.unstubAllEnvs();
  });

  it('buildAuthHeaders api-key', () => {
    vi.stubEnv('MY_KEY', 'k123');
    const headers = buildAuthHeaders({ type: 'api-key', envVar: 'MY_KEY', headerName: 'X-Custom-Key' });
    expect(headers['X-Custom-Key']).toBe('k123');
    vi.unstubAllEnvs();
  });

  it('buildAuthHeaders none returns empty', () => {
    expect(buildAuthHeaders({ type: 'none' })).toEqual({});
    expect(buildAuthHeaders(undefined)).toEqual({});
  });

  it('createHttpHandler calls endpoint with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Hello!' }),
    });
    const handler = createHttpHandler(HTTP_MANIFEST, 'greet', mockFetch as unknown as typeof fetch);
    const result = await handler({ name: 'Alice' });
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/tools/call');
    expect(JSON.parse(opts.body as string)).toMatchObject({ name: 'greet' });
  });

  it('createHttpHandler handles HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    const handler = createHttpHandler(HTTP_MANIFEST, 'greet', mockFetch as unknown as typeof fetch);
    const result = await handler({ name: 'Bob' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('createHttpHandler handles network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const handler = createHttpHandler(HTTP_MANIFEST, 'ping', mockFetch as unknown as typeof fetch);
    const result = await handler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('createHttpAdapter creates handlers for all actions', () => {
    const mockFetch = vi.fn();
    const handlers = createHttpAdapter({ manifest: HTTP_MANIFEST, fetchFn: mockFetch as unknown as typeof fetch });
    expect(handlers.has('test-http__greet')).toBe(true);
    expect(handlers.has('test-http__ping')).toBe(true);
    expect(handlers.size).toBe(2);
  });

  it('createHttpAdapter prefixes action names with tool id', () => {
    const handlers = createHttpAdapter({ manifest: HTTP_MANIFEST });
    for (const key of handlers.keys()) {
      expect(key.startsWith('test-http__')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// MCP Adapter
// ---------------------------------------------------------------------------

describe('mcp-adapter', () => {
  it('createMcpHandler sends JSON-RPC 2.0 request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: '{"value":42}' }], isError: false },
      }),
    });
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({ text: 'hello' });
    expect(result.success).toBe(true);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
  });

  it('createMcpHandler handles MCP error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid request' },
      }),
    });
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({ text: 'fail' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('-32600');
  });

  it('createMcpHandler parses JSON in text content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: '{"echo":"hello"}' }] },
      }),
    });
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({ text: 'hello' });
    expect(result.success).toBe(true);
    expect((result.data as { echo: string }).echo).toBe('hello');
  });

  it('createMcpHandler handles HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('createMcpHandler handles network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'));
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({});
    expect(result.success).toBe(false);
  });

  it('createMcpHandler handles empty result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1 }), // no result
    });
    const handler = createMcpHandler(MCP_MANIFEST, 'echo', mockFetch as unknown as typeof fetch);
    const result = await handler({});
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Script Adapter
// ---------------------------------------------------------------------------

describe('script-adapter', () => {
  function makeMockSpawn(stdout: string, exitCode = 0) {
    return vi.fn().mockReturnValue({
      stdout: {
        on: (_: string, cb: (chunk: Buffer) => void) => {
          setTimeout(() => cb(Buffer.from(stdout)), 0);
        },
      },
      stderr: { on: (_: string, _cb: unknown) => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(exitCode), 5);
      },
    });
  }

  it('createScriptHandler calls spawn with action name', async () => {
    const mockSpawn = makeMockSpawn('{"result": 1}');
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    const result = await handler({ input: 'test' });
    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      './scripts/my-tool.sh',
      ['compute'],
      expect.objectContaining({ shell: true }),
    );
  });

  it('createScriptHandler parses JSON stdout', async () => {
    const mockSpawn = makeMockSpawn('{"answer": 42}');
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    const result = await handler({ input: 'x' });
    expect(result.success).toBe(true);
    expect((result.data as { answer: number }).answer).toBe(42);
  });

  it('createScriptHandler returns raw string when stdout is not JSON', async () => {
    const mockSpawn = makeMockSpawn('plain output');
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    const result = await handler({});
    expect(result.success).toBe(true);
    expect(result.data).toBe('plain output');
  });

  it('createScriptHandler handles non-zero exit code', async () => {
    const mockSpawn = vi.fn().mockReturnValue({
      stdout: { on: () => {} },
      stderr: {
        on: (_: string, cb: (chunk: Buffer) => void) => {
          setTimeout(() => cb(Buffer.from('script error')), 0);
        },
      },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(1), 5);
      },
    });
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    const result = await handler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('script error');
  });

  it('createScriptHandler passes WEAVE_TOOL_ARGS env var', async () => {
    const mockSpawn = makeMockSpawn('{}');
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    await handler({ foo: 'bar' });
    const opts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env['WEAVE_TOOL_ARGS']).toBe('{"foo":"bar"}');
  });

  it('createScriptAdapter creates handlers for all actions', () => {
    const mockSpawn = vi.fn();
    const handlers = createScriptAdapter(SCRIPT_MANIFEST, mockSpawn);
    expect(handlers.has('test-script__compute')).toBe(true);
    expect(handlers.size).toBe(1);
  });

  it('createScriptHandler handles spawn error', async () => {
    const mockSpawn = vi.fn().mockReturnValue({
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event: string, _: unknown, cb?: unknown) => {
        if (event === 'error') (cb as (err: Error) => void)(new Error('ENOENT'));
      },
    });
    // Wrap to emit error immediately
    const errorSpawn = vi.fn().mockReturnValue({
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event: string, cb: (x: unknown) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ENOENT')), 5);
        if (event === 'close') {
          // never fires
        }
      },
    });
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', errorSpawn);
    const result = await handler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('durationMs is a non-negative number', async () => {
    const mockSpawn = makeMockSpawn('{}');
    const handler = createScriptHandler(SCRIPT_MANIFEST, 'compute', mockSpawn);
    const result = await handler({});
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tool Loader
// ---------------------------------------------------------------------------

const MANIFEST_JSON = JSON.stringify(HTTP_MANIFEST);

function makeFsAdapter(files: Record<string, string | string[]>): LoaderFsAdapter {
  // Normalize all keys to forward-slash form for cross-platform consistency
  const norm = (p: unknown): string => (p as string).replace(/\\/g, '/');
  const normalized: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(files)) normalized[norm(k)] = v;

  return {
    existsSync: (p: unknown) => {
      const path = norm(p);
      return path in normalized || Object.keys(normalized).some((k) => k.startsWith(path + '/') || k.startsWith(path));
    },
    readdirSync: (p: unknown): string[] => {
      const path = norm(p);
      const result = normalized[path];
      if (Array.isArray(result)) return result;
      return Object.keys(normalized)
        .filter((k) => k.startsWith(path + '/') && k !== path)
        .map((k) => k.replace(path + '/', '').split('/')[0]!)
        .filter((v, i, arr) => arr.indexOf(v) === i);
    },
    readFileSync: (p: unknown): string => {
      const path = norm(p);
      const content = normalized[path];
      if (typeof content === 'string') return content;
      throw new Error(`File not found: ${path}`);
    },
    mkdirSync: () => {},
    writeFileSync: () => {},
  } as unknown as LoaderFsAdapter;
}

describe('tool-loader', () => {
  it('loadManifestFile returns valid manifest', () => {
    const fs = makeFsAdapter({ '/proj/.weave/tools/test.tool.json': MANIFEST_JSON });
    const { manifest, error } = loadManifestFile('/proj/.weave/tools/test.tool.json', fs);
    expect(error).toBeNull();
    expect(manifest?.id).toBe('test-http');
  });

  it('loadManifestFile returns error for invalid JSON', () => {
    const fs = makeFsAdapter({ '/proj/bad.tool.json': 'not-json' });
    const { manifest, error } = loadManifestFile('/proj/bad.tool.json', fs);
    expect(manifest).toBeNull();
    expect(error).toContain('Invalid JSON');
  });

  it('loadManifestFile returns error for invalid manifest', () => {
    const fs = makeFsAdapter({ '/proj/missing.tool.json': '{}' });
    const { manifest, error } = loadManifestFile('/proj/missing.tool.json', fs);
    expect(manifest).toBeNull();
    expect(error).toContain('Validation failed');
  });

  it('loadLocalManifests returns empty when dir does not exist', () => {
    const fs = makeFsAdapter({});
    const result = loadLocalManifests('/fake', fs);
    expect(result.manifests).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('loadLocalManifests loads .tool.json files', () => {
    const toolsDir = '/project/.weave/tools';
    const fs = makeFsAdapter({
      [toolsDir]: ['test-http.tool.json', 'readme.txt'],
      [`${toolsDir}/test-http.tool.json`]: MANIFEST_JSON,
    });
    const result = loadLocalManifests('/project', fs);
    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0].id).toBe('test-http');
  });

  it('loadLocalManifests skips non-.tool.json files', () => {
    const toolsDir = '/project/.weave/tools';
    const fs = makeFsAdapter({
      [toolsDir]: ['README.md', 'config.json'],
    });
    const result = loadLocalManifests('/project', fs);
    expect(result.manifests).toHaveLength(0);
  });

  it('loadNpmManifests returns empty when @openweave-tools not present', () => {
    const fs = makeFsAdapter({});
    const result = loadNpmManifests('/project', fs);
    expect(result.manifests).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('loadNpmManifests loads npm package manifests', () => {
    const nmDir = '/project/node_modules/@openweave-tools';
    const pkg = `${nmDir}/test-pkg`;
    const fs = makeFsAdapter({
      [nmDir]: ['test-pkg'],
      [`${pkg}/openweave.tool.json`]: MANIFEST_JSON,
    });
    const result = loadNpmManifests('/project', fs);
    expect(result.manifests).toHaveLength(1);
  });

  it('loadManifestFile returns error on unreadable file', () => {
    const badFs: LoaderFsAdapter = {
      existsSync: () => true,
      readdirSync: () => [],
      readFileSync: () => { throw new Error('EACCES'); },
    } as unknown as LoaderFsAdapter;
    const { error } = loadManifestFile('/protected.tool.json', badFs);
    expect(error).toContain('Cannot read file');
  });

  it('loadLocalManifests records errors for invalid files', () => {
    const toolsDir = '/project/.weave/tools';
    const fs = makeFsAdapter({
      [toolsDir]: ['bad.tool.json'],
      [`${toolsDir}/bad.tool.json`]: 'not json',
    });
    const result = loadLocalManifests('/project', fs);
    expect(result.errors).toHaveLength(1);
    expect(result.manifests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tool Store
// ---------------------------------------------------------------------------

function makeStoreFs(): {
  data: Record<string, string>;
  fs: LoaderFsAdapter & { writeFileSync: (p: string, d: string) => void };
} {
  const data: Record<string, string> = {};
  const fs = {
    existsSync: (p: unknown) => (p as string) in data,
    readFileSync: (p: unknown) => data[p as string] ?? (() => { throw new Error('not found'); })(),
    writeFileSync: (p: unknown, d: unknown) => { data[p as string] = d as string; },
    mkdirSync: () => {},
    readdirSync: () => [],
  };
  return { data, fs: fs as unknown as LoaderFsAdapter & { writeFileSync: (p: string, d: string) => void } };
}

describe('tool-store', () => {
  it('list returns empty array initially', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    expect(store.list()).toHaveLength(0);
  });

  it('add persists manifest', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    expect(store.has('test-http')).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('get returns manifest by id', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    const m = store.get('test-http');
    expect(m?.name).toBe('Test HTTP Tool');
  });

  it('get returns null for unknown id', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    expect(store.get('unknown')).toBeNull();
  });

  it('remove deletes manifest', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    const removed = store.remove('test-http');
    expect(removed).toBe(true);
    expect(store.has('test-http')).toBe(false);
  });

  it('remove returns false for unknown id', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    expect(store.remove('ghost')).toBe(false);
  });

  it('list returns all stored manifests', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    store.add(MCP_MANIFEST);
    expect(store.list()).toHaveLength(2);
  });

  it('clear removes all manifests', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('overwrites existing manifest on add', () => {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store.add(HTTP_MANIFEST);
    const updated = { ...HTTP_MANIFEST, name: 'Updated Name' };
    store.add(updated);
    expect(store.get('test-http')?.name).toBe('Updated Name');
    expect(store.size()).toBe(1);
  });

  it('reads persisted data across instances', () => {
    const { fs } = makeStoreFs();
    const store1 = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    store1.add(HTTP_MANIFEST);
    const store2 = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    expect(store2.has('test-http')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ExternalToolBridge
// ---------------------------------------------------------------------------

describe('ExternalToolBridge', () => {
  function makeBridgeStore() {
    const { fs } = makeStoreFs();
    const store = new ToolStore('/proj', fs as ConstructorParameters<typeof ToolStore>[1]);
    return store;
  }

  it('registerManifest adds tool to bridge', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    bridge.registerManifest(HTTP_MANIFEST);
    expect(bridge.has('test-http')).toBe(true);
    expect(bridge.size).toBe(1);
  });

  it('registerManifest creates prefixed action names', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    const reg = bridge.registerManifest(HTTP_MANIFEST);
    expect(reg.actionNames).toContain('test-http__greet');
    expect(reg.actionNames).toContain('test-http__ping');
  });

  it('registerManifest wires handlers into registry', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    const registered: string[] = [];
    const registry = { register: (def: { name: string }) => registered.push(def.name) };
    bridge.registerManifest(HTTP_MANIFEST, registry);
    expect(registered).toContain('test-http__greet');
    expect(registered).toContain('test-http__ping');
  });

  it('list returns all registered tools', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    bridge.registerManifest(HTTP_MANIFEST);
    bridge.registerManifest(MCP_MANIFEST);
    expect(bridge.list()).toHaveLength(2);
  });

  it('get returns registered tool', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    bridge.registerManifest(HTTP_MANIFEST);
    expect(bridge.get('test-http')?.manifest.name).toBe('Test HTTP Tool');
  });

  it('unregister removes tool', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    bridge.registerManifest(HTTP_MANIFEST);
    const removed = bridge.unregister('test-http');
    expect(removed).toBe(true);
    expect(bridge.has('test-http')).toBe(false);
  });

  it('execute returns error for unknown action', async () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    const result = await bridge.execute('nonexistent__action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('loadAll returns loaded count zero with no manifests', async () => {
    const emptyFs: LoaderFsAdapter = {
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
    } as unknown as LoaderFsAdapter;
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    const { loaded, errors } = await bridge.loadAll(undefined, emptyFs);
    expect(loaded).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('registeredAt is an ISO timestamp', () => {
    const bridge = new ExternalToolBridge('/proj', makeBridgeStore());
    const reg = bridge.registerManifest(HTTP_MANIFEST);
    expect(new Date(reg.registeredAt).toString()).not.toBe('Invalid Date');
  });
});
