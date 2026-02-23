import { IWeaveProvider, ProviderClosedError } from "./types.js";

/**
 * MemoryProvider
 *
 * An in-memory implementation of IWeaveProvider backed by a plain `Map`.
 * Zero-latency reads/writes, no I/O, no external dependencies.
 *
 * Ideal for:
 *  - Unit tests (fast, isolated, no temp-file cleanup needed)
 *  - Ephemeral sessions where persistence across restarts is not required
 *  - Streaming pipelines that only need within-process memory
 */
export class MemoryProvider<T = unknown> implements IWeaveProvider<T> {
  private store = new Map<string, T>();
  private closed = false;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    this.closed = true;
    this.store.clear();
  }

  // -------------------------------------------------------------------------
  // Core operations
  // -------------------------------------------------------------------------

  async get(key: string): Promise<T | null> {
    this.assertOpen();
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    const keys = [...this.store.keys()];
    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Utility — exposed for testing introspection
  // -------------------------------------------------------------------------

  /** Current number of stored records. */
  get size(): number {
    return this.store.size;
  }

  /** Whether the provider has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private assertOpen(): void {
    if (this.closed) throw new ProviderClosedError("MemoryProvider");
  }
}
