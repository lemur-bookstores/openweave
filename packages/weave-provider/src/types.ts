/**
 * weave-provider — Core type definitions
 *
 * IWeaveProvider<T> is the single storage contract that all provider
 * implementations must satisfy. It follows a simple key-value model with
 * optional namespace prefixes so that different subsystems (graph, sessions,
 * vectors, paths) can share a single provider instance without colliding.
 */

// ---------------------------------------------------------------------------
// Core contract
// ---------------------------------------------------------------------------

/**
 * Storage-agnostic key-value provider used by WeaveGraph, SessionLifecycle,
 * VectorStore and WeavePath for all persistence needs.
 *
 * @typeParam T The value type stored under each key. In practice this will be
 *              a serialisable plain object (JSON-compatible).
 */
export interface IWeaveProvider<T = unknown> {
  /**
   * Retrieve a single record by its full key.
   * Returns `null` if the key does not exist.
   */
  get(key: string): Promise<T | null>;

  /**
   * Persist a record under the given key, overwriting any previous value.
   */
  set(key: string, value: T): Promise<void>;

  /**
   * Remove the record associated with the given key.
   * A no-op if the key does not exist (must NOT throw).
   */
  delete(key: string): Promise<void>;

  /**
   * List all keys that start with the given prefix.
   * If prefix is omitted, return every key in the store.
   *
   * @param prefix Optional key prefix filter (e.g. `"graph:"`, `"session:"`).
   */
  list(prefix?: string): Promise<string[]>;

  /**
   * Delete all records whose keys start with the given prefix.
   * If prefix is omitted, the entire store is wiped.
   *
   * @param prefix Optional key prefix filter.
   */
  clear(prefix?: string): Promise<void>;

  /**
   * Release any resources held by this provider (file handles, DB connections
   * etc.). After `close()` is called the provider must not accept further
   * operations.
   */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/**
 * A zero-argument async factory that resolves to a ready-to-use provider.
 * Used by the registry when building providers from a connection string.
 */
export type ProviderFactory<T = unknown> = () => Promise<IWeaveProvider<T>>;

// ---------------------------------------------------------------------------
// Registry configuration
// ---------------------------------------------------------------------------

/**
 * Environment variable that controls which provider the registry resolves.
 *
 * Accepted values (case-insensitive):
 *   - `"json"` (default)        → JsonProvider
 *   - `"memory"`                → MemoryProvider
 *   - `"sqlite"` / a file path  → weave-provider-sqlite (separate package)
 *   - `"mongodb"` / a URI       → weave-provider-mongodb (separate package)
 *   - `"postgres"` / a URI      → weave-provider-postgres (separate package)
 *   - `"mysql"` / a URI         → weave-provider-mysql (separate package)
 */
export const WEAVE_PROVIDER_ENV = "WEAVE_PROVIDER";

/**
 * Environment variable that controls the root data directory used by the
 * JsonProvider (and, conventionally, any file-based provider).
 */
export const WEAVE_DATA_DIR_ENV = "WEAVE_DATA_DIR";

/**
 * Default data directory value when WEAVE_DATA_DIR is not set.
 */
export const DEFAULT_DATA_DIR = "./weave-data";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when a provider operation is invoked after `close()` has been called.
 */
export class ProviderClosedError extends Error {
  constructor(providerName: string) {
    super(`[${providerName}] provider has been closed and is no longer usable`);
    this.name = "ProviderClosedError";
  }
}

/**
 * Thrown when the registry cannot resolve a provider from the current
 * environment configuration.
 */
export class UnknownProviderError extends Error {
  constructor(value: string) {
    super(
      `[weave-provider] Unknown provider type "${value}". ` +
        `Set ${WEAVE_PROVIDER_ENV}=json|memory or install the corresponding ` +
        `weave-provider-* package.`
    );
    this.name = "UnknownProviderError";
  }
}
