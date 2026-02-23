import { IWeaveProvider, ProviderClosedError } from "@openweave/weave-provider";

// ── Minimal injectable interface ──────────────────────────────────────────
// Mirrors the subset of pg.Pool/Client used by PostgresProvider.
// Tests inject PGlite (in-process PostgreSQL) via this interface.

export interface IPostgresPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface PostgresProviderOptions {
  /** PostgreSQL connection string — e.g. `postgresql://user:pass@localhost/db` */
  connectionString?: string;
  /** Table name (default: `kv_store`) */
  table?: string;
  /**
   * Inject a pre-built pool/client.
   * Accepts `pg.Pool`, `pg.Client`, or `@electric-sql/pglite`'s `PGlite` instance.
   */
  pool?: IPostgresPool;
}

/**
 * PostgresProvider
 *
 * IWeaveProvider backed by PostgreSQL (via `pg` driver or `@electric-sql/pglite`).
 *
 * Schema:
 * ```sql
 * CREATE TABLE kv_store (
 *   namespace  TEXT NOT NULL,
 *   id         TEXT NOT NULL,
 *   value      TEXT NOT NULL,
 *   updated_at TEXT NOT NULL,
 *   PRIMARY KEY (namespace, id)
 * );
 * ```
 *
 * Both PostgreSQL (via `pg.Pool`) and the in-process PGlite are supported through
 * the injectable `IPostgresPool` interface.
 *
 * @example
 * // Real connection
 * const p = await PostgresProvider.connect({ connectionString: 'postgresql://...' });
 *
 * // In-process (testing / serverless)
 * import { PGlite } from '@electric-sql/pglite';
 * const p = await PostgresProvider.connect({ pool: new PGlite() });
 */
export class PostgresProvider<T = unknown> implements IWeaveProvider<T> {
  private pool: IPostgresPool;
  private table: string;
  private closed = false;

  private constructor(pool: IPostgresPool, table: string) {
    this.pool = pool;
    this.table = table;
  }

  /**
   * Create and initialise the provider.
   * Pass `pool` to inject an existing instance (PGlite, pg.Client, etc.).
   */
  static async connect<T = unknown>(opts: PostgresProviderOptions = {}): Promise<PostgresProvider<T>> {
    const table = opts.table ?? "kv_store";
    let pool: IPostgresPool;

    if (opts.pool) {
      pool = opts.pool;
    } else {
      const { Pool } = await import("pg");
      pool = new Pool({ connectionString: opts.connectionString });
    }

    const provider = new PostgresProvider<T>(pool, table);
    await provider.bootstrap();
    return provider;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    this.closed = true;
    await this.pool.end();
  }

  // ── Core operations ───────────────────────────────────────────────────────

  async get(key: string): Promise<T | null> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    const res = await this.pool.query(
      `SELECT value FROM ${this.table} WHERE namespace = $1 AND id = $2`,
      [ns, id]
    );
    const row = (res.rows as Array<{ value: string }>)[0];
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    await this.pool.query(
      `INSERT INTO ${this.table} (namespace, id, value, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (namespace, id) DO UPDATE SET
         value      = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at`,
      [ns, id, JSON.stringify(value), new Date().toISOString()]
    );
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    await this.pool.query(
      `DELETE FROM ${this.table} WHERE namespace = $1 AND id = $2`,
      [ns, id]
    );
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    if (!prefix) {
      const res = await this.pool.query(
        `SELECT namespace, id FROM ${this.table} ORDER BY namespace, id`
      );
      return (res.rows as Array<{ namespace: string; id: string }>).map((r) =>
        this.joinKey(r.namespace, r.id)
      );
    }

    const { ns, id: idPrefix } = this.splitKey(prefix);
    const res = await this.pool.query(
      `SELECT namespace, id FROM ${this.table}
       WHERE namespace = $1 AND id LIKE $2
       ORDER BY id`,
      [ns, `${idPrefix}%`]
    );
    return (res.rows as Array<{ namespace: string; id: string }>)
      .map((r) => this.joinKey(r.namespace, r.id))
      .filter((k) => k.startsWith(prefix));
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    if (!prefix) {
      await this.pool.query(`DELETE FROM ${this.table}`);
      return;
    }
    const keys = await this.list(prefix);
    for (const key of keys) {
      const { ns, id } = this.splitKey(key);
      await this.pool.query(
        `DELETE FROM ${this.table} WHERE namespace = $1 AND id = $2`,
        [ns, id]
      );
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  get isClosed(): boolean {
    return this.closed;
  }

  async count(): Promise<number> {
    const res = await this.pool.query(`SELECT COUNT(*) AS n FROM ${this.table}`);
    return Number((res.rows as Array<{ n: string | number }>)[0]?.n ?? 0);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        namespace  TEXT NOT NULL,
        id         TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      )
    `);
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
    if (this.closed) throw new ProviderClosedError("PostgresProvider");
  }
}
