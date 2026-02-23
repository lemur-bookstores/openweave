/**
 * @openweave/weave-check — Provider Contract Spec
 *
 * Re-usable test suite that validates any `IWeaveProvider` implementation
 * against the 16-point contract. Designed to be called inside a `describe`
 * block from any vitest test file.
 *
 * No external dependencies — uses only vitest helpers and a duck-typed
 * `ProviderLike<T>` interface so that weave-check remains self-contained.
 *
 * @example
 * ```ts
 * import { describe } from 'vitest';
 * import { runProviderContractTests } from '@openweave/weave-check';
 * import { MyProvider } from '@openweave/weave-provider-xxx';
 *
 * describe('MyProvider — contract', () => {
 *   runProviderContractTests(() => MyProvider.connect({ ... }));
 * });
 * ```
 */

import { it, expect, beforeEach, afterEach } from "vitest";

// ── Duck-typed interface ──────────────────────────────────────────────────
// Mirrors IWeaveProvider<T> without importing from weave-provider so that
// this file has zero external runtime dependencies.

export interface ProviderLike<T = unknown> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  clear(prefix?: string): Promise<void>;
  close(): Promise<void>;
}

export type ProviderFactory<T = unknown> =
  () => Promise<ProviderLike<T>> | ProviderLike<T>;

// ── Contract runner ───────────────────────────────────────────────────────

/**
 * runProviderContractTests
 *
 * Call inside a `describe` block. Creates a fresh provider before each test
 * and closes it after (if not already closed).
 *
 * @param factory  Function that returns a new (or freshly reset) provider.
 */
export function runProviderContractTests<T = Record<string, unknown>>(
  factory: ProviderFactory<T>
): void {
  let provider: ProviderLike<T>;

  beforeEach(async () => {
    provider = await factory();
  });

  afterEach(async () => {
    try { await provider.close(); } catch { /* already closed */ }
  });

  // ── get / set ─────────────────────────────────────────────────────────

  it("returns null for a missing key", async () => {
    expect(await provider.get("no:such:key")).toBeNull();
  });

  it("stores and retrieves a record", async () => {
    const value: unknown = { msg: "hello", n: 42 };
    await provider.set("test:record", value as T);
    expect(await provider.get("test:record")).toEqual(value);
  });

  it("overwrites an existing record", async () => {
    await provider.set("test:overwrite", { v: 1 } as T);
    await provider.set("test:overwrite", { v: 2 } as T);
    expect(await provider.get("test:overwrite")).toEqual({ v: 2 });
  });

  it("handles keys with colons and slashes", async () => {
    await provider.set("graph:session/abc-123", { data: true } as T);
    expect(await provider.get("graph:session/abc-123")).toEqual({ data: true });
  });

  it("stores complex nested objects", async () => {
    const obj: unknown = { a: [1, 2, 3], b: { c: null, d: true }, e: "string" };
    await provider.set("test:nested", obj as T);
    expect(await provider.get("test:nested")).toEqual(obj);
  });

  it("deletes an existing record", async () => {
    await provider.set("test:delete-me", { x: 1 } as T);
    await provider.delete("test:delete-me");
    expect(await provider.get("test:delete-me")).toBeNull();
  });

  it("delete is a no-op for missing keys (no throw)", async () => {
    await expect(provider.delete("missing:key")).resolves.toBeUndefined();
  });

  it("lists all keys when no prefix given", async () => {
    await provider.set("graph:a", {} as T);
    await provider.set("graph:b", {} as T);
    await provider.set("session:x", {} as T);
    const keys = await provider.list();
    expect(keys).toEqual(expect.arrayContaining(["graph:a", "graph:b", "session:x"]));
    expect(keys).toHaveLength(3);
  });

  it("filters keys by prefix", async () => {
    await provider.set("graph:a", {} as T);
    await provider.set("graph:b", {} as T);
    await provider.set("session:x", {} as T);
    const keys = await provider.list("graph:");
    expect(keys).toEqual(expect.arrayContaining(["graph:a", "graph:b"]));
    expect(keys).toHaveLength(2);
  });

  it("returns empty array when no keys match prefix", async () => {
    await provider.set("graph:a", {} as T);
    expect(await provider.list("session:")).toEqual([]);
  });

  it("returns empty array when store is empty", async () => {
    expect(await provider.list()).toEqual([]);
  });

  it("clears all records when no prefix given", async () => {
    await provider.set("a:1", {} as T);
    await provider.set("b:2", {} as T);
    await provider.clear();
    expect(await provider.list()).toEqual([]);
  });

  it("clears only records matching prefix", async () => {
    await provider.set("graph:a", {} as T);
    await provider.set("graph:b", {} as T);
    await provider.set("session:x", {} as T);
    await provider.clear("graph:");
    expect(await provider.list()).toEqual(["session:x"]);
  });

  it("clear is a no-op when prefix matches nothing", async () => {
    await provider.set("graph:a", {} as T);
    await provider.clear("session:");
    expect(await provider.list()).toEqual(["graph:a"]);
  });

  it("throws on get after close", async () => {
    await provider.close();
    await expect(provider.get("any:key")).rejects.toThrow();
  });

  it("throws on set after close", async () => {
    await provider.close();
    await expect(provider.set("any:key", {} as T)).rejects.toThrow();
  });
}
