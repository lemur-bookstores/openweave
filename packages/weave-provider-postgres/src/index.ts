import { ProviderRegistry } from "@openweave/weave-provider";
import { PostgresProvider } from "./postgres-provider.js";

// Auto-register "postgres" factory when this package is imported.
// Activated when WEAVE_PROVIDER=postgres is set in the environment.
ProviderRegistry.register("postgres", async () => {
  const connectionString =
    process.env["WEAVE_POSTGRES_URL"] ??
    process.env["DATABASE_URL"] ??
    "postgresql://postgres:postgres@localhost:5432/openweave";
  return PostgresProvider.connect({ connectionString });
});

export { PostgresProvider } from "./postgres-provider.js";
export type { IPostgresPool, PostgresProviderOptions } from "./postgres-provider.js";
