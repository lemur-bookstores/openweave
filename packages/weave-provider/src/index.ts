/**
 * @openweave/weave-provider
 *
 * Storage-agnostic persistence contract for OpenWeave.
 *
 * Quick start:
 * ```ts
 * import { resolveProvider } from "@openweave/weave-provider";
 *
 * const provider = await resolveProvider<MyRecord>();
 * await provider.set("ns:my-key", { hello: "world" });
 * const record = await provider.get("ns:my-key");
 * await provider.close();
 * ```
 */

// Core contract + error types
export type { IWeaveProvider, ProviderFactory } from "./types.js";
export {
  WEAVE_PROVIDER_ENV,
  WEAVE_DATA_DIR_ENV,
  DEFAULT_DATA_DIR,
  ProviderClosedError,
  UnknownProviderError,
} from "./types.js";

// Built-in implementations
export { MemoryProvider } from "./memory-provider.js";
export { JsonProvider } from "./json-provider.js";

// Registry + convenience resolver
export { ProviderRegistry, resolveProvider } from "./registry.js";
