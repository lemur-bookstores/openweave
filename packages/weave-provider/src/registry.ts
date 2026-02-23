import {
  IWeaveProvider,
  ProviderFactory,
  WEAVE_PROVIDER_ENV,
  WEAVE_DATA_DIR_ENV,
  DEFAULT_DATA_DIR,
  UnknownProviderError,
} from "./types.js";
import { JsonProvider } from "./json-provider.js";
import { MemoryProvider } from "./memory-provider.js";

/**
 * ProviderRegistry
 *
 * Central factory and registration hub for IWeaveProvider implementations.
 *
 * Built-in providers:
 *   "json"   → JsonProvider  (default)
 *   "memory" → MemoryProvider
 *
 * Third-party providers (weave-provider-sqlite, weave-provider-mongodb …) can
 * register themselves at startup via `ProviderRegistry.register()`.
 *
 * Runtime resolution order:
 *   1. `WEAVE_PROVIDER` environment variable (e.g. `WEAVE_PROVIDER=memory`)
 *   2. Falls back to `"json"` when the env var is absent or empty
 */
export class ProviderRegistry {
  private static factories = new Map<string, ProviderFactory<unknown>>();

  static {
    // Register built-in providers
    ProviderRegistry.register("json", async () => {
      const dataDir = process.env[WEAVE_DATA_DIR_ENV] ?? DEFAULT_DATA_DIR;
      return new JsonProvider(dataDir);
    });

    ProviderRegistry.register("memory", async () => new MemoryProvider());
  }

  /**
   * Register a new provider factory under a named key.
   * The key is normalised to lower-case before storing.
   *
   * @example
   * // In weave-provider-sqlite:
   * ProviderRegistry.register("sqlite", async () => new SqliteProvider(...));
   */
  static register<T = unknown>(name: string, factory: ProviderFactory<T>): void {
    ProviderRegistry.factories.set(name.toLowerCase(), factory as ProviderFactory<unknown>);
  }

  /**
   * Resolve and instantiate a provider.
   *
   * @param type Explicit provider type string. When omitted, reads
   *             `process.env.WEAVE_PROVIDER`.  Defaults to `"json"`.
   *
   * @throws {UnknownProviderError} if the type is not registered.
   */
  static async resolve<T = unknown>(type?: string): Promise<IWeaveProvider<T>> {
    const raw = (type ?? process.env[WEAVE_PROVIDER_ENV] ?? "json")
      .trim()
      .toLowerCase();

    const factory = ProviderRegistry.factories.get(raw);
    if (!factory) throw new UnknownProviderError(raw);

    return factory() as Promise<IWeaveProvider<T>>;
  }

  /**
   * Returns the list of currently registered provider names.
   * Useful for diagnostics and help text.
   */
  static available(): string[] {
    return [...ProviderRegistry.factories.keys()].sort();
  }

  /**
   * Remove a registered provider (mainly for test isolation).
   */
  static unregister(name: string): void {
    ProviderRegistry.factories.delete(name.toLowerCase());
  }
}

/**
 * Convenience function — resolve the default (or env-configured) provider.
 *
 * @example
 * const provider = await resolveProvider<GraphSnapshot>();
 * await provider.set("graph:my-session", snapshot);
 */
export async function resolveProvider<T = unknown>(
  type?: string
): Promise<IWeaveProvider<T>> {
  return ProviderRegistry.resolve<T>(type);
}
