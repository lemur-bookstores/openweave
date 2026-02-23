import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProviderClosedError } from "@openweave/weave-provider";
import { SqliteProvider } from "./sqlite-provider.js";

// ---------------------------------------------------------------------------
// Helper: in-memory SqliteProvider for tests (no temp files, no cleanup)
// ---------------------------------------------------------------------------

function makeProvider<T = Record<string, unknown>>() {
  return new SqliteProvider<T>(":memory:");
}

// ---------------------------------------------------------------------------
// IWeaveProvider contract — SqliteProvider
// Mirrors exactly the contract run in weave-provider/weave-provider.test.ts
// so any future provider candidate can be validated with the same checklist.
// ---------------------------------------------------------------------------

describe("IWeaveProvider contract — SqliteProvider", () => {
  let provider: SqliteProvider<Record<string, unknown>>;

  beforeEach(() => {
    provider = makeProvider();
  });

  afterEach(async () => {
    try { await provider.close(); } catch { /* already closed */ }
  });

  // ── get / set ─────────────────────────────────────────────────────────────

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
    const complex = {
      nodes: { n1: { id: "n1", label: "foo", type: "CONCEPT" } },
      edges: {},
      metadata: { chatId: "chat1", version: "0.1.0" },
    };
    await provider.set("graph:complex", complex);
    expect(await provider.get("graph:complex")).toEqual(complex);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("deletes an existing record", async () => {
    await provider.set("test:del", { x: 1 });
    await provider.delete("test:del");
    expect(await provider.get("test:del")).toBeNull();
  });

  it("delete is a no-op for missing keys (no throw)", async () => {
    await expect(provider.delete("no:such:key")).resolves.not.toThrow();
  });

  // ── list ─────────────────────────────────────────────────────────────────

  it("lists all keys when no prefix given", async () => {
    await provider.set("a:1", {});
    await provider.set("b:2", {});
    await provider.set("c:3", {});
    const keys = await provider.list();
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(expect.arrayContaining(["a:1", "b:2", "c:3"]));
  });

  it("filters keys by prefix", async () => {
    await provider.set("graph:s1", {});
    await provider.set("graph:s2", {});
    await provider.set("session:s1", {});
    const keys = await provider.list("graph:");
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(expect.arrayContaining(["graph:s1", "graph:s2"]));
  });

  it("returns empty array when no keys match prefix", async () => {
    await provider.set("graph:x", {});
    expect(await provider.list("session:")).toEqual([]);
  });

  it("returns empty array when store is empty", async () => {
    expect(await provider.list()).toEqual([]);
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  it("clears all records when no prefix given", async () => {
    await provider.set("k1", {});
    await provider.set("k2", {});
    await provider.clear();
    expect(await provider.list()).toEqual([]);
  });

  it("clears only records matching prefix", async () => {
    await provider.set("graph:a", {});
    await provider.set("graph:b", {});
    await provider.set("session:c", {});
    await provider.clear("graph:");
    expect(await provider.list()).toEqual(["session:c"]);
  });

  it("clear is a no-op when prefix matches nothing", async () => {
    await provider.set("graph:a", {});
    await provider.clear("session:");
    expect(await provider.list()).toEqual(["graph:a"]);
  });

  // ── close / ProviderClosedError ───────────────────────────────────────────

  it("throws ProviderClosedError on get after close", async () => {
    await provider.close();
    await expect(provider.get("any")).rejects.toThrow(ProviderClosedError);
  });

  it("throws ProviderClosedError on set after close", async () => {
    await provider.close();
    await expect(provider.set("any", {})).rejects.toThrow(ProviderClosedError);
  });
});

// ---------------------------------------------------------------------------
// SqliteProvider — extras
// ---------------------------------------------------------------------------

describe("SqliteProvider — extras", () => {
  it("exposes .size property", async () => {
    const p = makeProvider();
    expect(p.size).toBe(0);
    await p.set("k", {});
    expect(p.size).toBe(1);
    await p.set("k2", {});
    expect(p.size).toBe(2);
    await p.delete("k");
    expect(p.size).toBe(1);
    await p.close();
  });

  it("exposes .isClosed property", async () => {
    const p = makeProvider();
    expect(p.isClosed).toBe(false);
    await p.close();
    expect(p.isClosed).toBe(true);
  });

  it("exposes .filename for :memory:", () => {
    const p = makeProvider();
    expect(p.filename).toBe(":memory:");
    p.close();
  });

  it("handles keys without namespace (no colon)", async () => {
    const p = makeProvider();
    await p.set("bare-key", { x: 99 });
    expect(await p.get("bare-key")).toEqual({ x: 99 });
    const keys = await p.list();
    expect(keys).toContain("bare-key");
    await p.close();
  });

  it("auto-registers under 'sqlite' in ProviderRegistry when index is imported", async () => {
    const { ProviderRegistry } = await import("@openweave/weave-provider");
    // import the side-effect registration
    await import("./index.js");
    expect(ProviderRegistry.available()).toContain("sqlite");
  });
});

// ---------------------------------------------------------------------------
// Benchmark: SqliteProvider vs JsonProvider for bulk read/write
// ---------------------------------------------------------------------------

describe("Benchmark — SqliteProvider vs JsonProvider (10 000 records)", () => {
  const N = 10_000;

  it(`writes ${N} records faster than 10 s`, async () => {
    const p = makeProvider<{ idx: number; payload: string }>();
    const payload = "x".repeat(256); // 256-byte value per record

    const start = performance.now();
    for (let i = 0; i < N; i++) {
      await p.set(`bench:rec${i}`, { idx: i, payload });
    }
    const elapsed = performance.now() - start;

    console.log(`  SqliteProvider write ${N} records: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(10_000);
    await p.close();
  });

  it(`reads ${N} records faster than 10 s`, async () => {
    const p = makeProvider<{ idx: number }>();

    // Pre-populate
    for (let i = 0; i < N; i++) {
      await p.set(`bench:rec${i}`, { idx: i });
    }

    const start = performance.now();
    for (let i = 0; i < N; i++) {
      await p.get(`bench:rec${i}`);
    }
    const elapsed = performance.now() - start;

    console.log(`  SqliteProvider read  ${N} records: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(10_000);
    await p.close();
  });
});
