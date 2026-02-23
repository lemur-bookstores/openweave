/**
 * @openweave/weave-provider-sqlite
 *
 * SQLite-backed IWeaveProvider for OpenWeave.
 *
 * This package auto-registers itself in the ProviderRegistry under the key
 * `"sqlite"` when imported, so any code that does:
 *
 *   import "@openweave/weave-provider-sqlite";
 *
 * will make WEAVE_PROVIDER=sqlite work transparently.
 *
 * @example
 * import { SqliteProvider } from "@openweave/weave-provider-sqlite";
 * const p = new SqliteProvider("./weave.db");
 * await p.set("graph:chat1", snapshot);
 * await p.close();
 */

import { ProviderRegistry, WEAVE_DATA_DIR_ENV } from "@openweave/weave-provider";
import { SqliteProvider } from "./sqlite-provider.js";

// Auto-register under "sqlite"
ProviderRegistry.register("sqlite", async () => {
  const dataDir = process.env[WEAVE_DATA_DIR_ENV] ?? "./weave-data";
  // Store as a single .db file inside the data directory
  const dbPath = `${dataDir}/weave.db`;
  return new SqliteProvider(dbPath);
});

export { SqliteProvider } from "./sqlite-provider.js";
