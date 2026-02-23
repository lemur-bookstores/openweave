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
import { join } from 'node:path';
import { SessionInfo, SessionStatus } from './types.js';

// ──────────────────────────────────────────────────────────
// SessionLifecycle
// ──────────────────────────────────────────────────────────

export class SessionLifecycle {
  private persistenceDir: string;
  private sessionsDir: string;

  constructor(persistenceDir: string = '.weave-sessions') {
    this.persistenceDir = persistenceDir;
    this.sessionsDir = join(persistenceDir, 'sessions');
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
    return join(this.sessionsDir, `${sessionId}.session.json`);
  }

  private ensureDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  getPersistenceDir(): string {
    return this.persistenceDir;
  }
}
