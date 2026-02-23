/**
 * Auth Middleware — M9: Remote WeaveLink
 *
 * Validates API keys for incoming HTTP requests.
 * Supports two header formats:
 *   - `Authorization: Bearer <key>`
 *   - `X-API-Key: <key>`
 *
 * When `disabled`, all requests pass through (useful for local stdio use).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface AuthConfig {
  /** Set to false to disable auth (local-only mode). Default: true */
  enabled: boolean;
  /** Allowed API keys. At least one required when enabled. */
  apiKeys: string[];
}

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

// ──────────────────────────────────────────────────────────
// AuthManager
// ──────────────────────────────────────────────────────────

export class AuthManager {
  private config: AuthConfig;

  constructor(config?: Partial<AuthConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      apiKeys: config?.apiKeys ?? [],
    };
  }

  /**
   * Validate an incoming request's API key.
   */
  verifyRequest(req: IncomingMessage): AuthResult {
    if (!this.config.enabled) {
      return { ok: true };
    }

    if (this.config.apiKeys.length === 0) {
      return { ok: false, reason: 'Server has no API keys configured' };
    }

    const key = this.extractKey(req);
    if (!key) {
      return {
        ok: false,
        reason: 'Missing API key — use Authorization: Bearer <key> or X-API-Key: <key>',
      };
    }

    if (!this.config.apiKeys.includes(key)) {
      return { ok: false, reason: 'Invalid API key' };
    }

    return { ok: true };
  }

  /**
   * Middleware helper: reject the request with 401 if auth fails,
   * then call `next()` if it passes.
   */
  middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void {
    const result = this.verifyRequest(req);
    if (result.ok) {
      next();
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.reason }));
    }
  }

  /**
   * Add an API key at runtime.
   */
  addKey(key: string): void {
    if (!this.config.apiKeys.includes(key)) {
      this.config.apiKeys.push(key);
    }
  }

  /**
   * Remove an API key.
   */
  removeKey(key: string): void {
    this.config.apiKeys = this.config.apiKeys.filter(k => k !== key);
  }

  /**
   * Disable auth (e.g., for local stdio mode).
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Enable auth.
   */
  enable(): void {
    this.config.enabled = true;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getKeyCount(): number {
    return this.config.apiKeys.length;
  }

  // ── private ──────────────────────────────────────────────

  private extractKey(req: IncomingMessage): string | null {
    // Authorization: Bearer <key>
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7).trim() || null;
    }

    // X-API-Key: <key>
    const apiKeyHeader = req.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
      return apiKeyHeader.trim();
    }

    return null;
  }
}

/**
 * Generate a secure random API key using rejection sampling to avoid modulo bias.
 * (VULN-013: previous implementation had ~3% bias for the first 8 characters)
 */
export function generateApiKey(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // 256 - (256 % 62) = 248 — the largest multiple of 62 that fits in a byte
  const maxUnbiased = 256 - (256 % chars.length);
  let result = '';
  while (result.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < maxUnbiased && result.length < length) {
        result += chars[b % chars.length];
      }
    }
  }
  return result;
}
