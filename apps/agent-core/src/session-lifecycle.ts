/**
 * SessionLifecycle
 *
 * Manages the three phases of an OpenWeave agent session:
 *   • init   — creates a new session (or resumes an existing one)
 *   • save   — persists session metadata to disk as JSON
 *   • close  — marks the session as closed and flushes state
 *
 * Persistence is intentionally lightweight (plain JSON files) so
 * there are no external database dependencies.
 *
 * File layout inside `persistenceDir`:
 *   <persistenceDir>/
 *     sessions/
 *       <sessionId>.session.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { IWeaveProvider } from '@openweave/weave-provider';
import { SessionInfo, SessionStatus } from './types.js';

// ──────────────────────────────────────────────────────────
// SessionLifecycle
// ──────────────────────────────────────────────────────────

export class SessionLifecycle {
  private persistenceDir: string;
  private sessionsDir: string;
  /** Optional async provider — when set, async methods route through it. */
  private provider: IWeaveProvider<SessionInfo> | null;

  /**
   * @param persistenceDir Root directory for file-based storage (default).
   * @param provider       Optional IWeaveProvider for storage-agnostic persistence.
   *                       When provided, `initAsync` / `saveAsync` / `loadAsync`
   *                       use it instead of the file system.
   */
  constructor(
    persistenceDir: string = '.weave-sessions',
    provider?: IWeaveProvider<SessionInfo>
  ) {
    this.persistenceDir = persistenceDir;
    this.sessionsDir = join(persistenceDir, 'sessions');
    this.provider = provider ?? null;
  }

  // ── Init ──────────────────────────────────────────────────

  /**
   * Create a new session record.
   * If a session with the same `sessionId` already exists on disk,
   * it is **loaded** (resume) rather than overwritten.
   */
  init(sessionId: string, chatId: string): SessionInfo {
    const existing = this.load(sessionId);
    if (existing) {
      // Resume: update lastActiveAt and mark active
      const resumed: SessionInfo = {
        ...existing,
        lastActiveAt: new Date().toISOString(),
        status: 'active',
      };
      this.save(resumed);
      return resumed;
    }

    const info: SessionInfo = {
      sessionId,
      chatId,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      status: 'active',
      turnCount: 0,
      toolCallCount: 0,
      compressionCount: 0,
    };

    this.save(info);
    return info;
  }

  // ── Incremental updates ───────────────────────────────────

  recordTurn(info: SessionInfo, toolCallsThisTurn: number): SessionInfo {
    const updated: SessionInfo = {
      ...info,
      lastActiveAt: new Date().toISOString(),
      turnCount: info.turnCount + 1,
      toolCallCount: info.toolCallCount + toolCallsThisTurn,
    };
    this.save(updated);
    return updated;
  }

  recordCompression(info: SessionInfo): SessionInfo {
    const updated: SessionInfo = {
      ...info,
      lastActiveAt: new Date().toISOString(),
      compressionCount: info.compressionCount + 1,
    };
    this.save(updated);
    return updated;
  }

  setStatus(info: SessionInfo, status: SessionStatus): SessionInfo {
    const updated: SessionInfo = { ...info, status, lastActiveAt: new Date().toISOString() };
    this.save(updated);
    return updated;
  }

  // ── Persistence ───────────────────────────────────────────

  save(info: SessionInfo): void {
    this.ensureDir();
    const path = this.sessionPath(info.sessionId);
    writeFileSync(path, JSON.stringify(info, null, 2), 'utf-8');
  }

  load(sessionId: string): SessionInfo | null {
    const path = this.sessionPath(sessionId);
    if (!existsSync(path)) return null;
    try {
      const raw = readFileSync(path, 'utf-8');
      return JSON.parse(raw) as SessionInfo;
    } catch {
      return null;
    }
  }

  /** List all session files in the persistence directory. */
  listSessionIds(): string[] {
    if (!existsSync(this.sessionsDir)) return [];
    try {
      return readdirSync(this.sessionsDir)
        .filter((f: any) => f.endsWith('.session.json'))
        .map((f: any) => f.replace('.session.json', ''));
    } catch {
      return [];
    }
  }

  // ── Close ─────────────────────────────────────────────────

  close(info: SessionInfo): SessionInfo {
    return this.setStatus(info, 'closed');
  }

  // ── Internal helpers ──────────────────────────────────────

  private sessionPath(sessionId: string): string {
    // VULN-012: strip any directory components to prevent path traversal
    const safe = basename(sessionId);
    return join(this.sessionsDir, `${safe}.session.json`);
  }

  private ensureDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  getPersistenceDir(): string {
    return this.persistenceDir;
  }

  // ── Async provider-based API ──────────────────────────────────────────────

  /**
   * Session key convention: `session:<sessionId>`
   */
  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  /**
   * Async variant of `init` — routes through the injected provider if present,
   * otherwise falls back to the sync file-based implementation.
   */
  async initAsync(sessionId: string, chatId: string): Promise<SessionInfo> {
    if (this.provider) {
      const existing = await this.provider.get(this.sessionKey(sessionId));
      if (existing) {
        const resumed: SessionInfo = { ...existing, lastActiveAt: new Date().toISOString(), status: 'active' };
        await this.provider.set(this.sessionKey(sessionId), resumed);
        return resumed;
      }
      const info: SessionInfo = {
        sessionId, chatId,
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        status: 'active',
        turnCount: 0, toolCallCount: 0, compressionCount: 0,
      };
      await this.provider.set(this.sessionKey(sessionId), info);
      return info;
    }
    return this.init(sessionId, chatId);
  }

  /** Async variant of `save` — routes through provider if present. */
  async saveAsync(info: SessionInfo): Promise<void> {
    if (this.provider) {
      await this.provider.set(this.sessionKey(info.sessionId), info);
      return;
    }
    this.save(info);
  }

  /** Async variant of `load` — routes through provider if present. */
  async loadAsync(sessionId: string): Promise<SessionInfo | null> {
    if (this.provider) {
      return this.provider.get(this.sessionKey(sessionId));
    }
    return this.load(sessionId);
  }

  /** Async variant of `listSessionIds` — routes through provider if present. */
  async listSessionIdsAsync(): Promise<string[]> {
    if (this.provider) {
      const keys = await this.provider.list('session:');
      return keys.map((k) => k.replace(/^session:/, ''));
    }
    return this.listSessionIds();
  }

  /** Close the provider if one is configured. */
  async closeProvider(): Promise<void> {
    if (this.provider) {
      await this.provider.close();
      this.provider = null;
    }
  }
}
