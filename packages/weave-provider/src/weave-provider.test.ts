import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import { IWeaveProvider, ProviderClosedError, UnknownProviderError } from "./types.js";
import { MemoryProvider } from "./memory-provider.js";
import { JsonProvider } from "./json-provider.js";
import { ProviderRegistry, resolveProvider } from "./registry.js";

// ---------------------------------------------------------------------------
// Shared contract test suite
// ---------------------------------------------------------------------------

/**
 * Runs the full IWeaveProvider contract against any implementation.
 * All M13 providers must pass every test in this suite.
 */
function runContractTests(
  name: string,
  factory: () => Promise<IWeaveProvider<Record<string, unknown>>>
): void {
  describe(`IWeaveProvider contract — ${name}`, () => {
    let provider: IWeaveProvider<Record<string, unknown>>;

    beforeEach(async () => {
      provider = await factory();
    });

    afterEach(async () => {
      // graceful close even if test failed mid-way
      try {
        await provider.close();
      } catch {
        // already closed in test
      }
    });

    // -----------------------------------------------------------------------
    // get / set
    // -----------------------------------------------------------------------

    it("returns null for a missing key", async () => {
      const result = await provider.get("no:such:key");
      expect(result).toBeNull();
    });

    it("stores and retrieves a record", async () => {
      const value = { msg: "hello", n: 42 };
      await provider.set("test:record", value);
      const retrieved = await provider.get("test:record");
      expect(retrieved).toEqual(value);
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

    // -----------------------------------------------------------------------
    // delete
    // -----------------------------------------------------------------------

    it("deletes an existing record", async () => {
      await provider.set("test:del", { x: 1 });
      await provider.delete("test:del");
      expect(await provider.get("test:del")).toBeNull();
    });

    it("delete is a no-op for missing keys (no throw)", async () => {
      await expect(provider.delete("no:such:key")).resolves.not.toThrow();
    });

    // -----------------------------------------------------------------------
    // list
    // -----------------------------------------------------------------------

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
      const graphKeys = await provider.list("graph:");
      expect(graphKeys).toHaveLength(2);
      expect(graphKeys).toEqual(expect.arrayContaining(["graph:s1", "graph:s2"]));
    });

    it("returns empty array when no keys match prefix", async () => {
      await provider.set("graph:x", {});
      const result = await provider.list("session:");
      expect(result).toEqual([]);
    });

    it("returns empty array when store is empty", async () => {
      expect(await provider.list()).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // clear
    // -----------------------------------------------------------------------

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
      const remaining = await provider.list();
      expect(remaining).toEqual(["session:c"]);
    });

    it("clear is a no-op when prefix matches nothing", async () => {
      await provider.set("graph:a", {});
      await provider.clear("session:");
      expect(await provider.list()).toEqual(["graph:a"]);
    });

    // -----------------------------------------------------------------------
    // close / ProviderClosedError
    // -----------------------------------------------------------------------

    it("throws ProviderClosedError on get after close", async () => {
      await provider.close();
      await expect(provider.get("any")).rejects.toThrow(ProviderClosedError);
    });

    it("throws ProviderClosedError on set after close", async () => {
      await provider.close();
      await expect(provider.set("any", {})).rejects.toThrow(ProviderClosedError);
    });
  });
}

// ---------------------------------------------------------------------------
// Run contract against MemoryProvider
// ---------------------------------------------------------------------------

runContractTests("MemoryProvider", async () => new MemoryProvider());

// ---------------------------------------------------------------------------
// Run contract against JsonProvider (temp dir, cleaned up after suite)
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `weave-provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

runContractTests("JsonProvider", async () => new JsonProvider(makeTempDir()));

// ---------------------------------------------------------------------------
// MemoryProvider — additional unit tests
// ---------------------------------------------------------------------------

describe("MemoryProvider — extras", () => {
  it("exposes .size property", async () => {
    const p = new MemoryProvider();
    expect(p.size).toBe(0);
    await p.set("k", {});
    expect(p.size).toBe(1);
    await p.close();
  });

  it("exposes .isClosed property", async () => {
    const p = new MemoryProvider();
    expect(p.isClosed).toBe(false);
    await p.close();
    expect(p.isClosed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JsonProvider — additional unit tests
// ---------------------------------------------------------------------------

describe("JsonProvider — extras", () => {
  it("exposes .directory property", () => {
    const dir = makeTempDir();
    const p = new JsonProvider(dir);
    expect(p.directory).toBe(dir);
  });

  it("creates the data directory if it does not exist", async () => {
    const dir = path.join(os.tmpdir(), `weave-auto-mkdir-${Date.now()}`);
    tempDirs.push(dir); // register for cleanup
    const p = new JsonProvider(dir);
    await p.set("k", { x: 1 });
    expect(fs.existsSync(dir)).toBe(true);
    await p.close();
  });

  it("each record is written as a separate JSON file", async () => {
    const dir = makeTempDir();
    const p = new JsonProvider(dir);
    await p.set("graph:abc", { data: 1 });
    await p.set("session:xyz", { data: 2 });
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(2);
    await p.close();
  });
});

// ---------------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------------

describe("ProviderRegistry", () => {
  it("resolves 'json' by default", async () => {
    const p = await ProviderRegistry.resolve("json");
    expect(p).toBeInstanceOf(JsonProvider);
    await p.close();
  });

  it("resolves 'memory'", async () => {
    const p = await ProviderRegistry.resolve("memory");
    expect(p).toBeInstanceOf(MemoryProvider);
    await p.close();
  });

  it("resolution is case-insensitive", async () => {
    const p = await ProviderRegistry.resolve("MEMORY");
    expect(p).toBeInstanceOf(MemoryProvider);
    await p.close();
  });

  it("lists available providers", () => {
    const available = ProviderRegistry.available();
    expect(available).toContain("json");
    expect(available).toContain("memory");
  });

  it("throws UnknownProviderError for unregistered type", async () => {
    await expect(ProviderRegistry.resolve("nonexistent")).rejects.toThrow(
      UnknownProviderError
    );
  });

  it("allows registering a custom provider", async () => {
    ProviderRegistry.register("test-custom", async () => new MemoryProvider());
    const p = await ProviderRegistry.resolve("test-custom");
    expect(p).toBeInstanceOf(MemoryProvider);
    await p.close();
    ProviderRegistry.unregister("test-custom");
  });

  it("resolveProvider() defaults to 'json' when env not set", async () => {
    delete process.env["WEAVE_PROVIDER"];
    const p = await resolveProvider();
    expect(p).toBeInstanceOf(JsonProvider);
    await p.close();
  });

  it("resolveProvider() reads WEAVE_PROVIDER from env", async () => {
    process.env["WEAVE_PROVIDER"] = "memory";
    const p = await resolveProvider();
    expect(p).toBeInstanceOf(MemoryProvider);
    await p.close();
    delete process.env["WEAVE_PROVIDER"];
  });
});
