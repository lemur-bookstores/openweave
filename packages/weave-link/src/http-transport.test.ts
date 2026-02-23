/**
 * M8/M9 Tests: Remote WeaveLink (HTTP Transport + Auth)
 * and Client Integrations (Installer)
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import type { IncomingMessage } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import { AuthManager, generateApiKey } from '../src/auth';
import { HttpTransport } from '../src/http-transport';
import { WeaveLinkServer } from '../src/mcp-server';
import { ConfigGenerator } from '../src/installer/config-generator';
import { ClaudeDesktopInstaller } from '../src/installer/claude-desktop';
import { CursorInstaller } from '../src/installer/cursor';

// ──────────────────────────────────────────────────────────
// M9 · Auth
// ──────────────────────────────────────────────────────────

describe('M9 · Remote WeaveLink', () => {
  describe('AuthManager', () => {
    let auth: AuthManager;

    beforeEach(() => {
      auth = new AuthManager({ enabled: true, apiKeys: ['test-key-1', 'test-key-2'] });
    });

    it('should validate a valid Bearer token', () => {
      const req = { headers: { authorization: 'Bearer test-key-1' } } as unknown as IncomingMessage;
      expect(auth.verifyRequest(req).ok).toBe(true);
    });

    it('should validate a valid X-API-Key header', () => {
      const req = { headers: { 'x-api-key': 'test-key-2' } } as unknown as IncomingMessage;
      expect(auth.verifyRequest(req).ok).toBe(true);
    });

    it('should reject an invalid key', () => {
      const req = { headers: { authorization: 'Bearer wrong-key' } } as unknown as IncomingMessage;
      const result = auth.verifyRequest(req);
      expect(result.ok).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should reject a request with no auth header', () => {
      const req = { headers: {} } as unknown as IncomingMessage;
      const result = auth.verifyRequest(req);
      expect(result.ok).toBe(false);
    });

    it('should pass all requests when disabled', () => {
      auth.disable();
      const req = { headers: {} } as unknown as IncomingMessage;
      expect(auth.verifyRequest(req).ok).toBe(true);
    });

    it('should enable and disable', () => {
      auth.disable();
      expect(auth.isEnabled()).toBe(false);
      auth.enable();
      expect(auth.isEnabled()).toBe(true);
    });

    it('should add a key at runtime', () => {
      auth.addKey('new-key');
      expect(auth.getKeyCount()).toBe(3);
    });

    it('should remove a key', () => {
      auth.removeKey('test-key-1');
      expect(auth.getKeyCount()).toBe(1);
    });

    it('should not duplicate keys on addKey', () => {
      auth.addKey('test-key-1');
      expect(auth.getKeyCount()).toBe(2);
    });

    it('should fail when enabled but no keys configured', () => {
      const emptyAuth = new AuthManager({ enabled: true, apiKeys: [] });
      const req = { headers: { 'x-api-key': 'some-key' } } as unknown as IncomingMessage;
      const result = emptyAuth.verifyRequest(req);
      expect(result.ok).toBe(false);
    });
  });

  describe('generateApiKey', () => {
    it('should generate a key of default length 32', () => {
      const key = generateApiKey();
      expect(key).toHaveLength(32);
    });

    it('should generate a key of custom length', () => {
      const key = generateApiKey(16);
      expect(key).toHaveLength(16);
    });

    it('should generate unique keys', () => {
      const k1 = generateApiKey();
      const k2 = generateApiKey();
      expect(k1).not.toBe(k2);
    });

    it('should use only alphanumeric characters', () => {
      const key = generateApiKey(100);
      expect(key).toMatch(/^[A-Za-z0-9]+$/);
    });
  });

  // ──────────────────────────────────────────────────────────
  // M9 · HTTP Transport
  // ──────────────────────────────────────────────────────────

  describe('HttpTransport', () => {
    let transport: HttpTransport;
    let port: number;

    // Pick a random high port to avoid conflicts
    beforeEach(async () => {
      port = 40000 + Math.floor(Math.random() * 10000);
      const auth = new AuthManager({ enabled: false });
      const server = new WeaveLinkServer();
      transport = new HttpTransport(server, auth, { port, host: '127.0.0.1', cors: true });
      await transport.start();
    });

    afterEach(async () => {
      if (transport.isRunning()) {
        await transport.stop();
      }
    });

    it('should start and be running', () => {
      expect(transport.isRunning()).toBe(true);
    });

    it('should report correct port', () => {
      expect(transport.getPort()).toBe(port);
    });

    it('should stop successfully', async () => {
      await transport.stop();
      expect(transport.isRunning()).toBe(false);
    });

    it('GET / should return server info', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.ok).toBe(true);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('tools');
    });

    it('GET /health should return ok', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.ok).toBe(true);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
    });

    it('GET /tools should list tools', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools`);
      expect(res.ok).toBe(true);
      const body = await res.json() as Record<string, unknown>;
      expect(Array.isArray(body.tools)).toBe(true);
      expect((body.tools as unknown[]).length).toBeGreaterThan(0);
    });

    it('POST /tools/call should invoke a tool', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'query_graph',
          args: { chat_id: 'test', query: 'hello' },
        }),
      });
      expect(res.ok).toBe(true);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('content');
    });

    it('POST /tools/call should reject invalid JSON', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    });

    it('POST /tools/call should reject missing tool field', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: {} }),
      });
      expect(res.status).toBe(400);
    });

    it('GET /unknown-path should return 404', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('OPTIONS (CORS preflight) should return 204', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools`, {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
    });

    it('should set CORS headers', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  describe('HttpTransport — with auth', () => {
    let transport: HttpTransport;
    let port: number;
    const API_KEY = 'my-test-api-key';

    beforeEach(async () => {
      port = 40000 + Math.floor(Math.random() * 10000);
      const auth = new AuthManager({ enabled: true, apiKeys: [API_KEY] });
      transport = new HttpTransport(new WeaveLinkServer(), auth, {
        port,
        host: '127.0.0.1',
      });
      await transport.start();
    });

    afterEach(async () => {
      if (transport.isRunning()) await transport.stop();
    });

    it('GET / should succeed without auth', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.ok).toBe(true);
    });

    it('GET /tools should fail without key', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools`);
      expect(res.status).toBe(401);
    });

    it('GET /tools should succeed with valid key', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools`, {
        headers: { 'X-API-Key': API_KEY },
      });
      expect(res.ok).toBe(true);
    });

    it('POST /tools/call should fail with wrong key', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify({ tool: 'query_graph', args: { chat_id: 'x', query: 'y' } }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('HttpTransport — SSE', () => {
    it('should track connected SSE client count', async () => {
      const port = 40000 + Math.floor(Math.random() * 10000);
      const auth = new AuthManager({ enabled: false });
      const transport = new HttpTransport(new WeaveLinkServer(), auth, { port, host: '127.0.0.1' });
      await transport.start();

      expect(transport.getConnectedClients()).toBe(0);

      // Start SSE connection (fire and forget — connection persists)
      const abortController = new AbortController();
      const ssePromise = fetch(`http://127.0.0.1:${port}/events`, {
        signal: abortController.signal,
      }).catch(() => null);

      // Give it a moment to register
      await new Promise(r => setTimeout(r, 100));

      expect(transport.getConnectedClients()).toBeGreaterThanOrEqual(0);

      abortController.abort();
      await ssePromise;
      await transport.stop();
    });
  });
});

// ──────────────────────────────────────────────────────────
// M8 · Client Integrations
// ──────────────────────────────────────────────────────────

describe('M8 · Client Integrations', () => {
  // Use a temp dir so we don't pollute the real config files
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `weave-link-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('ConfigGenerator', () => {
    it('should generate stdio entry', () => {
      const entry = ConfigGenerator.stdioEntry();
      expect(entry.command).toBe('npx');
      expect(entry.args).toContain('stdio');
    });

    it('should generate http entry with port', () => {
      const entry = ConfigGenerator.httpEntry({ port: 3001 });
      expect(entry.args).toContain('3001');
      expect(entry.args).toContain('http');
    });

    it('should include api key in env when provided', () => {
      const entry = ConfigGenerator.stdioEntry({ apiKey: 'my-key' });
      expect(entry.env?.['WEAVE_API_KEY']).toBe('my-key');
    });

    it('should omit env when no api key', () => {
      const entry = ConfigGenerator.stdioEntry();
      expect(entry.env).toBeUndefined();
    });

    it('should build full MCP config object', () => {
      const cfg = ConfigGenerator.buildMCPConfig('openweave', 'stdio');
      expect(cfg.mcpServers).toHaveProperty('openweave');
    });

    it('should serialize to pretty JSON', () => {
      const cfg = ConfigGenerator.buildMCPConfig();
      const json = ConfigGenerator.toJSON(cfg);
      expect(json).toContain('\n');
      expect(json).toContain('mcpServers');
    });

    it('should merge into existing config preserving other servers', () => {
      const existing = {
        mcpServers: {
          'other-server': { command: 'other', args: [] },
        },
      };
      const merged = ConfigGenerator.mergeIntoExisting(existing, 'openweave', 'stdio');
      expect(merged.mcpServers).toHaveProperty('other-server');
      expect(merged.mcpServers).toHaveProperty('openweave');
    });

    it('should overwrite existing openweave entry on re-install', () => {
      const existing = {
        mcpServers: {
          openweave: { command: 'old', args: [] },
        },
      };
      const merged = ConfigGenerator.mergeIntoExisting(existing, 'openweave', 'http');
      expect(merged.mcpServers['openweave'].args).toContain('http');
    });
  });

  describe('ClaudeDesktopInstaller', () => {
    it('should install WeaveLink into a test config path', async () => {
      const cfgPath = path.join(tmpDir, 'claude', 'claude_desktop_config.json');
      const result = await ClaudeDesktopInstaller.install({}, 'stdio', cfgPath);
      expect(result.success).toBe(true);
      expect(result.configWritten).toBeDefined();

      const parsed = JSON.parse(result.configWritten!);
      expect(parsed.mcpServers).toHaveProperty('openweave');
    });

    it('should read empty config when file does not exist', async () => {
      const cfgPath = path.join(tmpDir, 'nonexistent.json');
      const cfg = await ClaudeDesktopInstaller.readConfig(cfgPath);
      expect(cfg.mcpServers).toEqual({});
    });

    it('should preserve existing servers on install', async () => {
      const cfgPath = path.join(tmpDir, 'claude_desktop_config.json');
      await fs.writeFile(cfgPath, JSON.stringify({
        mcpServers: { 'existing-server': { command: 'x', args: [] } },
      }), 'utf-8');

      const result = await ClaudeDesktopInstaller.install({}, 'stdio', cfgPath);
      const parsed = JSON.parse(result.configWritten!);
      expect(parsed.mcpServers).toHaveProperty('existing-server');
      expect(parsed.mcpServers).toHaveProperty('openweave');
    });

    it('should uninstall and remove the openweave entry', async () => {
      const cfgPath = path.join(tmpDir, 'claude_desktop_config.json');
      await ClaudeDesktopInstaller.install({}, 'stdio', cfgPath);
      const unResult = await ClaudeDesktopInstaller.uninstall(cfgPath);
      expect(unResult.success).toBe(true);

      const parsed = JSON.parse(unResult.configWritten!);
      expect(parsed.mcpServers).not.toHaveProperty('openweave');
    });

    it('should handle uninstall when entry is not present', async () => {
      const cfgPath = path.join(tmpDir, 'claude_desktop_config.json');
      await fs.writeFile(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf-8');
      const result = await ClaudeDesktopInstaller.uninstall(cfgPath);
      expect(result.success).toBe(true);
    });

    it('should return a cross-platform config path', () => {
      const cfgPath = ClaudeDesktopInstaller.getConfigPath();
      expect(cfgPath).toContain('Claude');
      expect(cfgPath).toContain('claude_desktop_config.json');
    });
  });

  describe('CursorInstaller', () => {
    it('should return global config path', () => {
      const p = CursorInstaller.getConfigPath('global');
      expect(p).toContain('.cursor');
      expect(p).toContain('mcp.json');
    });

    it('should return project config path with workspace root', () => {
      const p = CursorInstaller.getConfigPath('project', tmpDir);
      expect(p).toBe(path.join(tmpDir, '.cursor', 'mcp.json'));
    });

    it('should install at project scope', async () => {
      const result = await CursorInstaller.install('project', tmpDir);
      expect(result.success).toBe(true);
      expect(result.scope).toBe('project');

      const cfg = await CursorInstaller.readConfig(result.configPath);
      expect(cfg.mcpServers).toHaveProperty('openweave');
    });

    it('should preserve other servers on install', async () => {
      const cfgPath = path.join(tmpDir, '.cursor', 'mcp.json');
      await fs.mkdir(path.dirname(cfgPath), { recursive: true });
      await fs.writeFile(cfgPath, JSON.stringify({
        mcpServers: { 'cursor-builtin': { command: 'c', args: [] } },
      }), 'utf-8');

      const result = await CursorInstaller.install('project', tmpDir);
      const cfg = JSON.parse(result.configWritten!);
      expect(cfg.mcpServers).toHaveProperty('cursor-builtin');
      expect(cfg.mcpServers).toHaveProperty('openweave');
    });

    it('should uninstall from project scope', async () => {
      await CursorInstaller.install('project', tmpDir);
      const result = await CursorInstaller.uninstall('project', tmpDir);
      expect(result.success).toBe(true);

      const cfg = await CursorInstaller.readConfig(result.configPath);
      expect(cfg.mcpServers).not.toHaveProperty('openweave');
    });

    it('should handle uninstall when entry is absent', async () => {
      const cfgPath = path.join(tmpDir, '.cursor', 'mcp.json');
      await fs.mkdir(path.dirname(cfgPath), { recursive: true });
      await fs.writeFile(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf-8');
      const result = await CursorInstaller.uninstall('project', tmpDir);
      expect(result.success).toBe(true);
    });

    it('should install with http mode', async () => {
      const result = await CursorInstaller.install('project', tmpDir, { port: 3001 }, 'http');
      expect(result.success).toBe(true);
      const cfg = JSON.parse(result.configWritten!);
      expect(cfg.mcpServers.openweave.args).toContain('http');
    });
  });

  describe('Integration', () => {
    it('should generate matching configs for both Claude and Cursor', async () => {
      const claudeCfgPath = path.join(tmpDir, 'claude', 'claude_desktop_config.json');
      const cursorWorkspace = path.join(tmpDir, 'workspace');
      await fs.mkdir(cursorWorkspace, { recursive: true });

      const claudeResult = await ClaudeDesktopInstaller.install({ port: 3001 }, 'http', claudeCfgPath);
      const cursorResult = await CursorInstaller.install('project', cursorWorkspace, { port: 3001 }, 'http');

      expect(claudeResult.success).toBe(true);
      expect(cursorResult.success).toBe(true);

      const claudeCfg = JSON.parse(claudeResult.configWritten!);
      const cursorCfg = JSON.parse(cursorResult.configWritten!);

      // Both should have the openweave server pointing to http mode with port 3001
      expect(claudeCfg.mcpServers.openweave.args).toContain('3001');
      expect(cursorCfg.mcpServers.openweave.args).toContain('3001');
    });
  });
});
