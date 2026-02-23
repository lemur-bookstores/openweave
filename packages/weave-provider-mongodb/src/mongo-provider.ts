import type { IWeaveProvider, ProviderClosedError as _PCE } from "@openweave/weave-provider";
import { ProviderClosedError } from "@openweave/weave-provider";

// ── Minimal injectable interface ──────────────────────────────────────────
// Mirrors the subset of mongodb.Collection used by MongoProvider so that
// tests can inject a lightweight in-memory fake without needing a real mongod.

export interface IMongoCollection {
  createIndex(spec: object, options?: object): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<{ value: string } | null>;
  replaceOne(
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<unknown>;
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
  find(filter: Record<string, unknown>): {
    project(p: Record<string, unknown>): {
      toArray(): Promise<Array<{ _id: string }>>;
    };
  };
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  countDocuments(filter?: Record<string, unknown>): Promise<number>;
}

export interface MongoProviderOptions {
  /** MongoDB connection URI — e.g. `mongodb://localhost:27017` */
  uri?: string;
  /** Database name (default: `openweave`) */
  database?: string;
  /** Collection name (default: `kv_store`) */
  collection?: string;
  /**
   * Inject a pre-built collection (skips MongoClient construction).
   * Used in tests to inject an in-memory fake.
   */
  _collection?: IMongoCollection;
}

/**
 * MongoProvider
 *
 * IWeaveProvider backed by MongoDB via the official `mongodb` driver.
 *
 * Document schema:
 * ```
 * {
 *   _id:        string,   // full key: "namespace:id"
 *   ns:         string,   // namespace portion (empty string if no colon)
 *   value:      string,   // JSON-serialised payload
 *   updatedAt:  string    // ISO-8601 timestamp
 * }
 * ```
 *
 * Connection is established lazily on the first operation.
 *
 * @example
 * const p = await MongoProvider.connect({ uri: 'mongodb://localhost:27017' });
 * await p.set('graph:chat1', { nodes: {}, edges: {} });
 * const snap = await p.get('graph:chat1');
 * await p.close();
 */
export class MongoProvider<T = unknown> implements IWeaveProvider<T> {
  private col: IMongoCollection;
  private closed = false;
  private clientClose?: () => Promise<void>;

  /** Prefer `MongoProvider.connect()` for real connections. */
  private constructor(col: IMongoCollection, clientClose?: () => Promise<void>) {
    this.col = col;
    this.clientClose = clientClose;
  }

  /**
   * Open a real MongoDB connection and return a ready-to-use provider.
   * For testing, use `MongoProvider.fromCollection(fake)` instead.
   */
  static async connect<T = unknown>(opts: MongoProviderOptions = {}): Promise<MongoProvider<T>> {
    if (opts._collection) return new MongoProvider<T>(opts._collection);

    // Dynamically import so the package compiles even if mongodb isn't installed
    const { MongoClient } = await import("mongodb");
    const uri = opts.uri ?? "mongodb://localhost:27017";
    const dbName = opts.database ?? "openweave";
    const colName = opts.collection ?? "kv_store";

    const client = new MongoClient(uri);
    await client.connect();
    const col = client.db(dbName).collection(colName) as unknown as IMongoCollection;
    await col.createIndex({ ns: 1 }, {});
    return new MongoProvider<T>(col, () => client.close());
  }

  /** Inject a pre-built collection (used in unit tests). */
  static fromCollection<T = unknown>(col: IMongoCollection): MongoProvider<T> {
    return new MongoProvider<T>(col);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    this.closed = true;
    if (this.clientClose) await this.clientClose();
  }

  // ── Core operations ───────────────────────────────────────────────────────

  async get(key: string): Promise<T | null> {
    this.assertOpen();
    const doc = await this.col.findOne({ _id: key });
    if (!doc) return null;
    return JSON.parse(doc.value) as T;
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    const ns = this.ns(key);
    await this.col.replaceOne(
      { _id: key },
      { _id: key, ns, value: JSON.stringify(value), updatedAt: new Date().toISOString() },
      { upsert: true }
    );
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    await this.col.deleteOne({ _id: key });
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    if (!prefix) {
      const docs = await this.col.find({}).project({ _id: 1 }).toArray();
      return docs.map((d) => d._id).sort();
    }
    // Filter by namespace prefix when the prefix contains ":"
    const colonIdx = prefix.indexOf(":");
    const nsFilter = colonIdx === -1 ? {} : { ns: prefix.slice(0, colonIdx) };
    const docs = await this.col.find(nsFilter).project({ _id: 1 }).toArray();
    return docs
      .map((d) => d._id)
      .filter((k) => k.startsWith(prefix))
      .sort();
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    if (!prefix) {
      await this.col.deleteMany({});
      return;
    }
    const keys = await this.list(prefix);
    for (const key of keys) await this.col.deleteOne({ _id: key });
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  get isClosed(): boolean {
    return this.closed;
  }

  async count(): Promise<number> {
    return this.col.countDocuments();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private ns(key: string): string {
    const i = key.indexOf(":");
    return i === -1 ? "" : key.slice(0, i);
  }

  private assertOpen(): void {
    if (this.closed) throw new ProviderClosedError("MongoProvider");
  }
}
