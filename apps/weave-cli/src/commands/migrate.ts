import { join } from "path";
import { CLIArgs, CommandResult, CliCommand } from "../types.js";
import { IWeaveProvider, JsonProvider, MemoryProvider } from "@openweave/weave-provider";

/**
 * MigrateCommand
 *
 * Migrate data between any two registered OpenWeave providers.
 *
 * Usage:
 *   weave migrate --from json --to sqlite
 *   weave migrate --from sqlite --to json --data-dir /my/data
 *   weave migrate --from json --to sqlite --dry-run
 *
 * Supported built-in providers (no external service needed):
 *   json     — JSON files in --data-dir (default: .weave)
 *   sqlite   — SQLite file via node:sqlite (requires @openweave/weave-provider-sqlite)
 *   memory   — In-memory (useful for --dry-run inspection)
 *
 * Extended providers (require running services + extra packages):
 *   mongodb  — requires @openweave/weave-provider-mongodb + WEAVE_MONGODB_URI
 *   postgres — requires @openweave/weave-provider-postgres + WEAVE_POSTGRES_URL
 *   mysql    — requires @openweave/weave-provider-mysql + WEAVE_MYSQL_URI
 */
export const migrateCommand: CliCommand = {
  name: "migrate",
  description: "Migrate data between OpenWeave storage providers",
  usage: "weave migrate --from <source> --to <destination> [options]",
  flags: {
    from: {
      short: "f",
      description: "Source provider (json | sqlite | memory | mongodb | postgres | mysql)",
      default: "json",
    },
    to: {
      short: "t",
      description: "Target provider (json | sqlite | memory | mongodb | postgres | mysql)",
      default: "sqlite",
    },
    "data-dir": {
      short: "d",
      description: "Data directory for file-based providers (default: .weave)",
      default: ".weave",
    },
    "db-file": {
      description: "SQLite database file path (default: <data-dir>/weave.db)",
      default: "",
    },
    prefix: {
      short: "p",
      description: "Migrate only keys matching this prefix (e.g. graph:)",
      default: "",
    },
    "dry-run": {
      description: "Preview what would be migrated without writing to destination",
      default: false,
    },
    verbose: {
      short: "v",
      description: "Verbose output",
      default: false,
    },
  },

  async execute(args: CLIArgs): Promise<CommandResult> {
    const fromName = (args.flags["from"] as string) || "json";
    const toName = (args.flags["to"] as string) || "sqlite";
    const dataDir = (args.flags["data-dir"] as string) || ".weave";
    const dbFile = (args.flags["db-file"] as string) || join(dataDir, "weave.db");
    const prefix = (args.flags["prefix"] as string) || undefined;
    const dryRun = !!args.flags["dry-run"];
    const verbose = !!args.flags["verbose"];

    if (fromName === toName) {
      return { success: false, message: "Source and destination providers must differ." };
    }

    const log = (msg: string) => { if (verbose) console.error(`  ${msg}`); };

    let source: IWeaveProvider<unknown>;
    let destination: IWeaveProvider<unknown>;

    try {
      source = await buildProvider(fromName, dataDir, dbFile, log);
    } catch (err) {
      return {
        success: false,
        message: `Failed to open source provider "${fromName}": ${(err as Error).message}`,
      };
    }

    try {
      if (!dryRun) {
        destination = await buildProvider(toName, dataDir, dbFile + ".migrated", log);
      } else {
        destination = new MemoryProvider<unknown>();
      }
    } catch (err) {
      await source.close().catch(() => {});
      return {
        success: false,
        message: `Failed to open destination provider "${toName}": ${(err as Error).message}`,
      };
    }

    try {
      const keys = await source.list(prefix);

      if (keys.length === 0) {
        return {
          success: true,
          message: `No keys found${prefix ? ` matching prefix "${prefix}"` : ""}. Nothing to migrate.`,
        };
      }

      log(`Found ${keys.length} key(s) to migrate...`);

      let migrated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const key of keys) {
        try {
          const value = await source.get(key);
          if (value !== null) {
            if (!dryRun) await destination.set(key, value);
            migrated++;
            log(`✓ ${key}`);
          }
        } catch (err) {
          failed++;
          errors.push(`  ${key}: ${(err as Error).message}`);
          log(`✗ ${key}: ${(err as Error).message}`);
        }
      }

      const dryRunNote = dryRun ? " [DRY RUN — no data written]" : "";
      const summary = [
        `Migration complete${dryRunNote}`,
        `  From:      ${fromName}`,
        `  To:        ${dryRun ? "memory (dry-run)" : toName}`,
        `  Keys:      ${keys.length} found`,
        `  Migrated:  ${migrated}`,
        ...(failed > 0 ? [`  Failed:    ${failed}`, ...errors] : []),
      ].join("\n");

      return { success: failed === 0, message: summary };
    } finally {
      await source.close().catch(() => {});
      if (!dryRun) await destination.close().catch(() => {});
    }
  },
};

// ---------------------------------------------------------------------------
// Factory: create a provider by name
// ---------------------------------------------------------------------------

async function buildProvider(
  name: string,
  dataDir: string,
  dbFile: string,
  log: (msg: string) => void
): Promise<IWeaveProvider<unknown>> {
  log(`Opening "${name}" provider...`);

  switch (name) {
    case "json":
      return new JsonProvider(dataDir);

    case "memory":
      return new MemoryProvider<unknown>();

    case "sqlite": {
      // Dynamically import to avoid hard dep; package must be installed
      const { SqliteProvider } = await import(
        "@openweave/weave-provider-sqlite" as string
      ).catch(() => {
        throw new Error(
          '"sqlite" provider requires @openweave/weave-provider-sqlite to be installed.'
        );
      });
      return new (SqliteProvider as new (path: string) => IWeaveProvider<unknown>)(dbFile);
    }

    case "mongodb": {
      const { MongoProvider } = await import(
        "@openweave/weave-provider-mongodb" as string
      ).catch(() => {
        throw new Error(
          '"mongodb" provider requires @openweave/weave-provider-mongodb to be installed.'
        );
      });
      const uri = process.env["WEAVE_MONGODB_URI"] ?? "mongodb://localhost:27017";
      return (MongoProvider as { connect(o: object): Promise<IWeaveProvider<unknown>> }).connect({
        uri,
      });
    }

    case "postgres": {
      const { PostgresProvider } = await import(
        "@openweave/weave-provider-postgres" as string
      ).catch(() => {
        throw new Error(
          '"postgres" provider requires @openweave/weave-provider-postgres to be installed.'
        );
      });
      const connectionString =
        process.env["WEAVE_POSTGRES_URL"] ??
        process.env["DATABASE_URL"] ??
        "postgresql://postgres:postgres@localhost:5432/openweave";
      return (
        PostgresProvider as { connect(o: object): Promise<IWeaveProvider<unknown>> }
      ).connect({ connectionString });
    }

    case "mysql": {
      const { MysqlProvider } = await import(
        "@openweave/weave-provider-mysql" as string
      ).catch(() => {
        throw new Error(
          '"mysql" provider requires @openweave/weave-provider-mysql to be installed.'
        );
      });
      const uri =
        process.env["WEAVE_MYSQL_URI"] ??
        process.env["DATABASE_URL"] ??
        "mysql://root:root@localhost:3306/openweave";
      return (MysqlProvider as { connect(o: object): Promise<IWeaveProvider<unknown>> }).connect({
        uri,
      });
    }

    default:
      throw new Error(
        `Unknown provider "${name}". Supported: json, sqlite, memory, mongodb, postgres, mysql.`
      );
  }
}
