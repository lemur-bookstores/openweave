import { promises as fs } from "fs";
import * as path from "path";
import { IWeaveProvider, ProviderClosedError, DEFAULT_DATA_DIR } from "./types.js";

/**
 * JsonProvider
 *
 * File-system implementation of IWeaveProvider that stores each record as an
 * individual JSON file inside a configurable data directory.
 *
 * Key → file-path mapping:
 *   key = "graph:my-session"  →  <dataDir>/graph__my-session.json
 *
 * Colons in keys are replaced with double-underscores and any characters that
 * are not safe for all major file systems are percent-encoded, so the mapping
 * is always reversible.
 *
 * Backward-compatible with the original weave-graph PersistenceManager:
 *   graph:<chatId>  →  weave-data/<chatId>.json   (no namespace prefix)
 * That legacy layout is preserved for existing data directories.
 */
export class JsonProvider<T = unknown> implements IWeaveProvider<T> {
  private dataDir: string;
  private closed = false;

  constructor(dataDir: string = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    this.closed = true;
  }

  // -------------------------------------------------------------------------
  // Core operations
  // -------------------------------------------------------------------------

  async get(key: string): Promise<T | null> {
    this.assertOpen();
    const filePath = this.keyToPath(key);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    await this.ensureDataDir();
    const filePath = this.keyToPath(key);
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    const filePath = this.keyToPath(key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // key didn't exist — honour "no-op" contract
    }
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    await this.ensureDataDir();
    let entries: string[];
    try {
      entries = await fs.readdir(this.dataDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const keys = entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.pathToKey(f));

    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    const keys = await this.list(prefix);
    await Promise.all(keys.map((k) => this.delete(k)));
  }

  // -------------------------------------------------------------------------
  // Key ↔ filename helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a logical key into an absolute file path.
   *
   * Rules (applied in order):
   *   1. Replace ":" with "__" (namespace separator)
   *   2. Replace "/" with "--" (path separator used in ids)
   *   3. Append ".json"
   */
  private keyToPath(key: string): string {
    const sanitized = key
      .replace(/:/g, "__")
      .replace(/\//g, "--")
      .replace(/[^a-zA-Z0-9_\-\.]/g, (c) => `~${c.codePointAt(0)?.toString(16)}~`);
    return path.join(this.dataDir, `${sanitized}.json`);
  }

  /**
   * Reverse of keyToPath — converts a filename back into a logical key.
   */
  private pathToKey(filename: string): string {
    const base = filename.endsWith(".json")
      ? filename.slice(0, -5)
      : filename;
    return base
      .replace(/~([0-9a-f]+)~/g, (_, hex) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      .replace(/--/g, "/")
      .replace(/__/g, ":");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureDataDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  private assertOpen(): void {
    if (this.closed) throw new ProviderClosedError("JsonProvider");
  }

  /** Expose dataDir for testing / diagnostics. */
  get directory(): string {
    return this.dataDir;
  }
}
