import { ProviderRegistry } from "@openweave/weave-provider";
import { MongoProvider } from "./mongo-provider.js";

// Auto-register "mongodb" factory when this package is imported.
// Activated when WEAVE_PROVIDER=mongodb is set in the environment.
ProviderRegistry.register("mongodb", async () => {
  const uri = process.env["WEAVE_MONGODB_URI"] ?? "mongodb://localhost:27017";
  const database = process.env["WEAVE_MONGODB_DB"] ?? "openweave";
  return MongoProvider.connect({ uri, database });
});

export { MongoProvider } from "./mongo-provider.js";
export type { IMongoCollection, MongoProviderOptions } from "./mongo-provider.js";
