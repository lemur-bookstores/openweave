import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProviderClosedError } from "@openweave/weave-provider";
import { MongoProvider, IMongoCollection } from "./mongo-provider.js";

// ---------------------------------------------------------------------------
// In-memory fake MongoDB collection
// Implements IMongoCollection without needing a real mongod binary.
// ---------------------------------------------------------------------------

class FakeMongoCollection implements IMongoCollection {
  private docs = new Map<string, { _id: string; ns: string; value: string; updatedAt: string }>();

  async createIndex(_spec: object, _options?: object): Promise<unknown> {
    return {};
  }

  async findOne(filter: Record<string, unknown>): Promise<{ value: string } | null> {
    const id = filter["_id"] as string;
    const doc = this.docs.get(id);
    return doc ? { value: doc.value } : null;
  }

  async replaceOne(
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
    _options: Record<string, unknown>
  ): Promise<unknown> {
    const id = filter["_id"] as string;
    this.docs.set(id, doc as { _id: string; ns: string; value: string; updatedAt: string });
    return {};
  }

  async deleteOne(filter: Record<string, unknown>): Promise<unknown> {
    this.docs.delete(filter["_id"] as string);
    return {};
  }

  find(filter: Record<string, unknown>): {
    project(p: Record<string, unknown>): { toArray(): Promise<Array<{ _id: string }>> };
  } {
    const ns = filter["ns"] as string | undefined;
    return {
      project: (_p: Record<string, unknown>) => ({
        toArray: async (): Promise<Array<{ _id: string }>> => {
          const all = [...this.docs.values()];
          return (ns !== undefined ? all.filter((d) => d.ns === ns) : all).map((d) => ({
            _id: d._id,
          }));
        },
      }),
    };
  }

  async deleteMany(filter: Record<string, unknown>): Promise<unknown> {
    const ns = filter["ns"] as string | undefined;
    if (ns !== undefined) {
      for (const [k, v] of this.docs) { if (v.ns === ns) this.docs.delete(k); }
    } else {
      this.docs.clear();
    }
    return {};
  }

  async countDocuments(_filter?: Record<string, unknown>): Promise<number> {
    return this.docs.size;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function makeProvider<T = Record<string, unknown>>() {
  return MongoProvider.fromCollection<T>(new FakeMongoCollection());
}

describe("IWeaveProvider contract — MongoProvider", () => {
  let provider: MongoProvider<Record<string, unknown>>;

  beforeEach(() => { provider = makeProvider(); });
  afterEach(async () => { try { await provider.close(); } catch { /* already closed */ } });

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
    await provider.close();
    await expect(provider.get("any:key")).rejects.toBeInstanceOf(ProviderClosedError);
  });

  it("throws ProviderClosedError on set after close", async () => {
    await provider.close();
    await expect(provider.set("any:key", {})).rejects.toBeInstanceOf(ProviderClosedError);
  });
});

describe("MongoProvider — extras", () => {
  let provider: MongoProvider<Record<string, unknown>>;

  beforeEach(() => { provider = makeProvider(); });
  afterEach(async () => { try { await provider.close(); } catch { /* already closed */ } });

  it("exposes .isClosed = false before close", () => {
    expect(provider.isClosed).toBe(false);
  });

  it("exposes .isClosed = true after close", async () => {
    await provider.close();
    expect(provider.isClosed).toBe(true);
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

  it("auto-registers under 'mongodb' in ProviderRegistry when index is imported", async () => {
    const { ProviderRegistry } = await import("@openweave/weave-provider");
    await import("./index.js");
    expect(ProviderRegistry.available()).toContain("mongodb");
  });
});
