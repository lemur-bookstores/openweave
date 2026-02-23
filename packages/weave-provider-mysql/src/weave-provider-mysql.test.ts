import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProviderClosedError } from "@openweave/weave-provider";
import { MysqlProvider, IMysqlPool } from "./mysql-provider.js";

// ---------------------------------------------------------------------------
// In-memory fake MySQL pool
// Parses the SQL patterns the MysqlProvider emits and simulates a real DB.
// ---------------------------------------------------------------------------

type Row = { namespace: string; id: string; value: string; updated_at: string };

class FakeMysqlPool implements IMysqlPool {
  private rows = new Map<string, Row>();

  private pk(ns: string, id: string) {
    return `${ns}\x00${id}`;
  }

  async execute(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
    const p = params ?? [];
    const s = sql.trim().replace(/\s+/g, " ");

    // SELECT value WHERE namespace=? AND id=?
    if (/^SELECT value FROM/.test(s)) {
      const [ns, id] = p as [string, string];
      const row = this.rows.get(this.pk(ns, id));
      return [row ? [{ value: row.value }] : [], []];
    }

    // INSERT ... ON DUPLICATE KEY UPDATE
    if (/^INSERT INTO/.test(s)) {
      const [ns, id, value, updatedAt] = p as [string, string, string, string];
      this.rows.set(this.pk(ns, id), { namespace: ns, id, value, updated_at: updatedAt });
      return [{ affectedRows: 1 }, []];
    }

    // DELETE WHERE namespace=? AND id=?
    if (/^DELETE FROM `kv_store` WHERE namespace/.test(s)) {
      const [ns, id] = p as [string, string];
      this.rows.delete(this.pk(ns, id));
      return [{ affectedRows: 1 }, []];
    }

    // SELECT namespace, id ORDER BY namespace, id  (no WHERE)
    if (/^SELECT namespace, id FROM `kv_store` ORDER/.test(s)) {
      const all = [...this.rows.values()].sort((a, b) =>
        a.namespace.localeCompare(b.namespace) || a.id.localeCompare(b.id)
      );
      return [all.map(({ namespace, id }) => ({ namespace, id })), []];
    }

    // SELECT namespace, id WHERE namespace=? AND id LIKE ?
    if (/^SELECT namespace, id FROM `kv_store` WHERE namespace/.test(s)) {
      const [ns, likePattern] = p as [string, string];
      const prefix = likePattern.slice(0, -1); // strip trailing %
      const matched = [...this.rows.values()]
        .filter((r) => r.namespace === ns && r.id.startsWith(prefix))
        .sort((a, b) => a.id.localeCompare(b.id));
      return [matched.map(({ namespace, id }) => ({ namespace, id })), []];
    }

    // DELETE FROM (all)
    if (/^DELETE FROM `kv_store`$/.test(s)) {
      this.rows.clear();
      return [{ affectedRows: this.rows.size }, []];
    }

    // SELECT COUNT(*)
    if (/^SELECT COUNT/.test(s)) {
      return [[{ n: this.rows.size }], []];
    }

    return [[], []];
  }

  async query(sql: string, _params?: unknown[]): Promise<[unknown, unknown]> {
    // bootstrap CREATE TABLE — no-op
    if (/^CREATE TABLE/i.test(sql.trim())) return [{ affectedRows: 0 }, []];
    return this.execute(sql, _params);
  }

  async end(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function makeProvider<T = Record<string, unknown>>(): Promise<MysqlProvider<T>> {
  return MysqlProvider.connect<T>({ pool: new FakeMysqlPool() });
}

describe("IWeaveProvider contract — MysqlProvider", () => {
  let provider: MysqlProvider<Record<string, unknown>>;

  beforeEach(async () => { provider = await makeProvider(); });
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

describe("MysqlProvider — extras", () => {
  let provider: MysqlProvider<Record<string, unknown>>;

  beforeEach(async () => { provider = await makeProvider(); });
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

  it("auto-registers under 'mysql' in ProviderRegistry when index is imported", async () => {
    const { ProviderRegistry } = await import("@openweave/weave-provider");
    await import("./index.js");
    expect(ProviderRegistry.available()).toContain("mysql");
  });
});
