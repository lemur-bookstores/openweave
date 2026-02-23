import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { ProviderClosedError } from "@openweave/weave-provider";
import { PostgresProvider, IPostgresPool } from "./postgres-provider.js";

// ---------------------------------------------------------------------------
// Shared PGlite instance — WASM is loaded ONCE for the entire file.
// State is reset via provider.clear() in each beforeEach.
// Tests that call close() use makeIsolatedProvider() instead.
// ---------------------------------------------------------------------------

let sharedProvider: PostgresProvider<Record<string, unknown>>;

function makePglitePool(): IPostgresPool {
  const db = new PGlite();
  return {
    query: (sql: string, params?: unknown[]) => db.query(sql, params as unknown[]),
    end: () => db.close(),
  };
}

// File-level lifecycle — runs once before ALL describe blocks
beforeAll(async () => {
  sharedProvider = await PostgresProvider.connect({ pool: makePglitePool() });
});

afterAll(async () => {
  try { await sharedProvider.close(); } catch { /* already closed */ }
});

async function makeIsolatedProvider<T = Record<string, unknown>>(): Promise<PostgresProvider<T>> {
  return PostgresProvider.connect<T>({ pool: makePglitePool() });
}

// ---------------------------------------------------------------------------
// IWeaveProvider contract — PostgresProvider
// ---------------------------------------------------------------------------

describe("IWeaveProvider contract — PostgresProvider", () => {
  let provider: PostgresProvider<Record<string, unknown>>;

  beforeEach(async () => {
    await sharedProvider.clear();
    provider = sharedProvider;
  });

  it("returns null for a missing key", async () => {
    expect(await provider.get("no:such:key")).toBeNull();
  });

  it("stores and retrieves a record", async () => {
    const value = { msg: "hello", n: 42 };
    await provider.set("test:record", value);
    expect(await provider.get("test:record")).toEqual(value);
  });

  it("overwrites an existing record", async () => {
    await provider.set("test:overwrite", { v: 1 });
    await provider.set("test:overwrite", { v: 2 });
    expect(await provider.get("test:overwrite")).toEqual({ v: 2 });
  });

  it("handles keys with colons and slashes", async () => {
    await provider.set("graph:session/abc-123", { data: true });
    expect(await provider.get("graph:session/abc-123")).toEqual({ data: true });
  });

  it("stores complex nested objects", async () => {
    const obj = { a: [1, 2, 3], b: { c: null, d: true }, e: "string" };
    await provider.set("test:nested", obj);
    expect(await provider.get("test:nested")).toEqual(obj);
  });

  it("deletes an existing record", async () => {
    await provider.set("test:delete-me", { x: 1 });
    await provider.delete("test:delete-me");
    expect(await provider.get("test:delete-me")).toBeNull();
  });

  it("delete is a no-op for missing keys (no throw)", async () => {
    await expect(provider.delete("missing:key")).resolves.toBeUndefined();
  });

  it("lists all keys when no prefix given", async () => {
    await provider.set("graph:a", {});
    await provider.set("graph:b", {});
    await provider.set("session:x", {});
    const keys = await provider.list();
    expect(keys).toEqual(expect.arrayContaining(["graph:a", "graph:b", "session:x"]));
    expect(keys).toHaveLength(3);
  });

  it("filters keys by prefix", async () => {
    await provider.set("graph:a", {});
    await provider.set("graph:b", {});
    await provider.set("session:x", {});
    const keys = await provider.list("graph:");
    expect(keys).toEqual(expect.arrayContaining(["graph:a", "graph:b"]));
    expect(keys).toHaveLength(2);
  });

  it("returns empty array when no keys match prefix", async () => {
    await provider.set("graph:a", {});
    expect(await provider.list("session:")).toEqual([]);
  });

  it("returns empty array when store is empty", async () => {
    expect(await provider.list()).toEqual([]);
  });

  it("clears all records when no prefix given", async () => {
    await provider.set("a:1", {});
    await provider.set("b:2", {});
    await provider.clear();
    expect(await provider.list()).toEqual([]);
  });

  it("clears only records matching prefix", async () => {
    await provider.set("graph:a", {});
    await provider.set("graph:b", {});
    await provider.set("session:x", {});
    await provider.clear("graph:");
    expect(await provider.list()).toEqual(["session:x"]);
  });

  it("clear is a no-op when prefix matches nothing", async () => {
    await provider.set("graph:a", {});
    await provider.clear("session:");
    expect(await provider.list()).toEqual(["graph:a"]);
  });

  it("throws ProviderClosedError on get after close", async () => {
    const p = await makeIsolatedProvider();
    await p.close();
    await expect(p.get("any:key")).rejects.toBeInstanceOf(ProviderClosedError);
  });

  it("throws ProviderClosedError on set after close", async () => {
    const p = await makeIsolatedProvider();
    await p.close();
    await expect(p.set("any:key", {})).rejects.toBeInstanceOf(ProviderClosedError);
  });
});

describe("PostgresProvider — extras", () => {
  let provider: PostgresProvider<Record<string, unknown>>;

  beforeEach(async () => {
    await sharedProvider.clear();
    provider = sharedProvider;
  });

  it("exposes .isClosed = false before close", () => {
    expect(provider.isClosed).toBe(false);
  });

  it("exposes .isClosed = true after close", async () => {
    const p = await makeIsolatedProvider();
    await p.close();
    expect(p.isClosed).toBe(true);
  });

  it("handles keys without namespace (no colon)", async () => {
    await provider.set("bare-key", { plain: true });
    expect(await provider.get("bare-key")).toEqual({ plain: true });
    const keys = await provider.list();
    expect(keys).toContain("bare-key");
  });

  it("count() reflects stored records", async () => {
    await provider.set("a:1", {});
    await provider.set("a:2", {});
    expect(await provider.count()).toBe(2);
  });

  it("auto-registers under 'postgres' in ProviderRegistry when index is imported", async () => {
    const { ProviderRegistry } = await import("@openweave/weave-provider");
    await import("./index.js");
    expect(ProviderRegistry.available()).toContain("postgres");
  });
});
