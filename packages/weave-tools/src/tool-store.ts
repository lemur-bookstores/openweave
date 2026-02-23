/**
 * Tool Store
 *
 * Persists registered tool manifests to `.weave/tools.json`.
 * Supports add / remove / list / get operations.
 *
 * Injectable FS functions for test isolation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ToolManifest } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolStoreData {
  version: 1;
  tools: Record<string, ToolManifest>;
  updatedAt: string;
}

export interface FsAdapter {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
}

const DEFAULT_FS: FsAdapter = { existsSync, readFileSync, writeFileSync, mkdirSync };

// ---------------------------------------------------------------------------
// ToolStore
// ---------------------------------------------------------------------------

export class ToolStore {
  private readonly storePath: string;
  private readonly fs: FsAdapter;

  constructor(projectRoot: string, fs: FsAdapter = DEFAULT_FS) {
    this.storePath = join(projectRoot, '.weave', 'tools.json');
    this.fs = fs;
  }

  // -------------------------------------------------------------------------

  private read(): ToolStoreData {
    if (!this.fs.existsSync(this.storePath)) {
      return { version: 1, tools: {}, updatedAt: new Date().toISOString() };
    }
    try {
      const raw = this.fs.readFileSync(this.storePath, 'utf8') as string;
      return JSON.parse(raw) as ToolStoreData;
    } catch {
      return { version: 1, tools: {}, updatedAt: new Date().toISOString() };
    }
  }

  private write(data: ToolStoreData): void {
    const dir = dirname(this.storePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true } as Parameters<typeof mkdirSync>[1]);
    }
    this.fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // -------------------------------------------------------------------------

  add(manifest: ToolManifest): void {
    const data = this.read();
    data.tools[manifest.id] = manifest;
    data.updatedAt = new Date().toISOString();
    this.write(data);
  }

  remove(id: string): boolean {
    const data = this.read();
    if (!(id in data.tools)) return false;
    delete data.tools[id];
    data.updatedAt = new Date().toISOString();
    this.write(data);
    return true;
  }

  get(id: string): ToolManifest | null {
    const data = this.read();
    return data.tools[id] ?? null;
  }

  list(): ToolManifest[] {
    const data = this.read();
    return Object.values(data.tools);
  }

  has(id: string): boolean {
    const data = this.read();
    return id in data.tools;
  }

  size(): number {
    return this.list().length;
  }

  clear(): void {
    this.write({ version: 1, tools: {}, updatedAt: new Date().toISOString() });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createToolStore(
  projectRoot: string,
  fs?: FsAdapter,
): ToolStore {
  return new ToolStore(projectRoot, fs);
}
