import { IWeaveProvider, ProviderClosedError } from "@openweave/weave-provider";

// ── Minimal injectable interface ──────────────────────────────────────────
// Mirrors the subset of mysql2's Pool/Connection used by MysqlProvider.
// Tests inject an in-memory fake through this interface — no real MySQL needed.

export interface IMysqlPool {
  execute(sql: string, params?: unknown[]): Promise<[unknown, unknown]>;
  query(sql: string, params?: unknown[]): Promise<[unknown, unknown]>;
  end(): Promise<void>;
}

export interface MysqlProviderOptions {
  /** mysql2 connection URI — e.g. `mysql://user:pass@localhost/db` */
  uri?: string;
  /** Host (default: `localhost`) */
  host?: string;
  /** Port (default: 3306) */
  port?: number;
  /** Database name */
  database?: string;
  /** Username */
  user?: string;
  /** Password */
  password?: string;
  /** Table name (default: `kv_store`) */
  table?: string;
  /**
   * Inject a pre-built pool/connection (used in unit tests).
   */
  pool?: IMysqlPool;
}

/**
 * MysqlProvider
 *
 * IWeaveProvider backed by MySQL / MariaDB via the `mysql2` promise driver.
 *
 * Schema:
 * ```sql
 * CREATE TABLE IF NOT EXISTS kv_store (
 *   namespace  VARCHAR(255) NOT NULL,
 *   id         VARCHAR(255) NOT NULL,
 *   value      LONGTEXT     NOT NULL,
 *   updated_at VARCHAR(30)  NOT NULL,
 *   PRIMARY KEY (namespace(100), id(150))
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 * ```
 *
 * @example
 * const p = await MysqlProvider.connect({ uri: 'mysql://root:pass@localhost/openweave' });
 * await p.set('graph:chat1', { nodes: {}, edges: {} });
 * await p.close();
 */
export class MysqlProvider<T = unknown> implements IWeaveProvider<T> {
  private pool: IMysqlPool;
  private table: string;
  private closed = false;

  private constructor(pool: IMysqlPool, table: string) {
    this.pool = pool;
    this.table = table;
  }

  /**
   * Create and initialise the provider.
   * Pass `pool` to inject an existing pool/connection (or an in-memory fake).
   */
  static async connect<T = unknown>(opts: MysqlProviderOptions = {}): Promise<MysqlProvider<T>> {
    const table = opts.table ?? "kv_store";
    let pool: IMysqlPool;

    if (opts.pool) {
      pool = opts.pool;
    } else {
      const mysql = await import("mysql2/promise");
      pool = await mysql.createPool({
        uri: opts.uri,
        host: opts.host ?? "localhost",
        port: opts.port ?? 3306,
        database: opts.database,
        user: opts.user,
        password: opts.password,
        waitForConnections: true,
        connectionLimit: 10,
      });
    }

    const provider = new MysqlProvider<T>(pool, table);
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
    const [rows] = await this.pool.execute(
      `SELECT value FROM \`${this.table}\` WHERE namespace = ? AND id = ?`,
      [ns, id]
    );
    const row = (rows as Array<{ value: string }>)[0];
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  async set(key: string, value: T): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    await this.pool.execute(
      `INSERT INTO \`${this.table}\` (namespace, id, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value      = VALUES(value),
         updated_at = VALUES(updated_at)`,
      [ns, id, JSON.stringify(value), new Date().toISOString()]
    );
  }

  async delete(key: string): Promise<void> {
    this.assertOpen();
    const { ns, id } = this.splitKey(key);
    await this.pool.execute(
      `DELETE FROM \`${this.table}\` WHERE namespace = ? AND id = ?`,
      [ns, id]
    );
  }

  async list(prefix?: string): Promise<string[]> {
    this.assertOpen();
    if (!prefix) {
      const [rows] = await this.pool.execute(
        `SELECT namespace, id FROM \`${this.table}\` ORDER BY namespace, id`
      );
      return (rows as Array<{ namespace: string; id: string }>).map((r) =>
        this.joinKey(r.namespace, r.id)
      );
    }

    const { ns, id: idPrefix } = this.splitKey(prefix);
    const [rows] = await this.pool.execute(
      `SELECT namespace, id FROM \`${this.table}\`
       WHERE namespace = ? AND id LIKE ?
       ORDER BY id`,
      [ns, `${idPrefix}%`]
    );
    return (rows as Array<{ namespace: string; id: string }>)
      .map((r) => this.joinKey(r.namespace, r.id))
      .filter((k) => k.startsWith(prefix));
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen();
    if (!prefix) {
      await this.pool.execute(`DELETE FROM \`${this.table}\``);
      return;
    }
    const keys = await this.list(prefix);
    for (const key of keys) {
      const { ns, id } = this.splitKey(key);
      await this.pool.execute(
        `DELETE FROM \`${this.table}\` WHERE namespace = ? AND id = ?`,
        [ns, id]
      );
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  get isClosed(): boolean {
    return this.closed;
  }

  async count(): Promise<number> {
    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS n FROM \`${this.table}\``
    );
    return Number((rows as Array<{ n: string | number }>)[0]?.n ?? 0);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    // mysql2 pool.execute() can't run CREATE TABLE — use query() instead
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS \`${this.table}\` (
        namespace  VARCHAR(255) NOT NULL,
        id         VARCHAR(255) NOT NULL,
        value      LONGTEXT     NOT NULL,
        updated_at VARCHAR(30)  NOT NULL,
        PRIMARY KEY (namespace(100), id(150))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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
    if (this.closed) throw new ProviderClosedError("MysqlProvider");
  }
}
