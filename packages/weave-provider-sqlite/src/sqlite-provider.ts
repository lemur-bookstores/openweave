import { DatabaseSync, StatementSync } from "node:sqlite";
import { IWeaveProvider, ProviderClosedError } from "@openweave/weave-provider";

/**
 * SqliteProvider
 *
 * Embedded SQLite implementation of IWeaveProvider built on the **Node.js
 * built-in `node:sqlite`** module (Node ≥ v22.5, stable in Node ≥ v23).
 * Zero external dependencies — no native compilation required.
 *
 * Schema (single table, shared DB file):
 *   CREATE TABLE kv_store (
 *     namespace TEXT NOT NULL,   -- e.g. "graph", "session", ""
 *     id        TEXT NOT NULL,   -- remainder after the first ":"
 *     value     TEXT NOT NULL,   -- JSON-serialised payload
 *     updated_at TEXT NOT NULL,  -- ISO-8601 timestamp
 *     PRIMARY KEY (namespace, id)
 *   )
 *
 * Key split rule:
 *   "graph:my-chat" → namespace="graph", id="my-chat"
 *   "plain-key"     → namespace="",      id="plain-key"
 *
 * @example
 * const p = new SqliteProvider("./weave.db");
 * await p.set("graph:chat1", { nodes: {}, edges: {}, metadata: {} });
 * const snap = await p.get("graph:chat1");
 * await p.close();
 */
export class SqliteProvider<T = unknown> implements IWeaveProvider<T> {
  private db: DatabaseSync;
  private closed = false;
  private readonly dbPath: string;

  // pre-compiled statements
  private stmtGet!: StatementSync;
  private stmtUpsert!: StatementSync;
  private stmtDelete!: StatementSync;
  private stmtList!: StatementSync;
  private stmtListPrefix!: StatementSync;
  private stmtClearAll!: StatementSync;
  private stmtCount!: StatementSync;

  constructor(dbPath: string = "./weave.db") {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.bootstrap();
    this.prepareStatements();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    this.closed = true;
    this.db.close();
  }

  // ── Core operations ──────────────────────────────────────────────────────

  async get(key: string): Promise<T | null> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    const row = this.stmtGet.get(ns, id) as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    this.stmtUpsert.run(ns, id, JSON.stringify(value), new Date().toISOString());
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    this.stmtDelete.run(ns, id);
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    if (!prefix) {
      const rows = this.stmtList.all() as Array<{ namespace: string; id: string }>;
      return rows.map((r) => this.joinKey(r.namespace, r.id));
    }

    const { ns, id: idPrefix } = this.splitKey(prefix);
    const rows = this.stmtListPrefix.all(ns, `${idPrefix}%`) as Array<{
      namespace: string;
      id: string;
    }>;
    return rows
      .map((r) => this.joinKey(r.namespace, r.id))
      .filter((k) => k.startsWith(prefix));
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    if (!prefix) {
      this.stmtClearAll.run();
      return;
    }
    const keys = await this.list(prefix);
    for (const key of keys) {
      const { ns, id } = this.splitKey(key);
      this.stmtDelete.run(ns, id);
    }
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────

  /** Current number of stored records. */
  get size(): number {
    const row = this.stmtCount.get() as { n: number } | undefined;
    return row?.n ?? 0;
  }

  /** Whether the provider has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Path/URI of the underlying database (`:memory:` for in-memory). */
  get filename(): string {
    return this.dbPath;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace  TEXT NOT NULL,
        id         TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
    `);
  }

  private prepareStatements(): void {
    this.stmtGet = this.db.prepare(
      "SELECT value FROM kv_store WHERE namespace = ? AND id = ?"
    );
    this.stmtUpsert = this.db.prepare(
      `INSERT INTO kv_store (namespace, id, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, id) DO UPDATE SET
         value      = excluded.value,
         updated_at = excluded.updated_at`
    );
    this.stmtDelete = this.db.prepare(
      "DELETE FROM kv_store WHERE namespace = ? AND id = ?"
    );
    this.stmtList = this.db.prepare(
      "SELECT namespace, id FROM kv_store ORDER BY namespace, id"
    );
    this.stmtListPrefix = this.db.prepare(
      "SELECT namespace, id FROM kv_store WHERE namespace = ? AND id LIKE ? ORDER BY id"
    );
    this.stmtClearAll = this.db.prepare("DELETE FROM kv_store");
    this.stmtCount = this.db.prepare("SELECT COUNT(*) AS n FROM kv_store");
  }

  private splitKey(key: string): { ns: string; id: string } {
    const colon = key.indexOf(":");
    if (colon === -1) return { ns: "", id: key };
    return { ns: key.slice(0, colon), id: key.slice(colon + 1) };
  }

  private joinKey(ns: string, id: string): string {
    return ns === "" ? id : `${ns}:${id}`;
  }

  private assertOpen(): void {
    if (this.closed) throw new ProviderClosedError("SqliteProvider");
  }
}