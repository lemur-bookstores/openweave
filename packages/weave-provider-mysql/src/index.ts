import { ProviderRegistry } from "@openweave/weave-provider";
import { MysqlProvider } from "./mysql-provider.js";

// Auto-register "mysql" factory when this package is imported.
// Activated when WEAVE_PROVIDER=mysql is set in the environment.
ProviderRegistry.register("mysql", async () => {
  const uri =
    process.env["WEAVE_MYSQL_URI"] ??
    process.env["DATABASE_URL"] ??
    "mysql://root:root@localhost:3306/openweave";
  return MysqlProvider.connect({ uri });
});

export { MysqlProvider } from "./mysql-provider.js";
export type { IMysqlPool, MysqlProviderOptions } from "./mysql-provider.js";
