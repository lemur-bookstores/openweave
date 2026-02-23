import { IWeaveProvider, JsonProvider } from "@openweave/weave-provider";
import { ContextGraphManager } from "./index";
import { GraphSnapshot } from "./types";

// Serialised form of GraphSnapshot — dates are stored as ISO strings
type SerializedSnapshot = Record<string, unknown>;

/**
 * PersistenceManager
 *
 * Handles saving and loading graph snapshots through a pluggable
 * IWeaveProvider. If no provider is injected, it falls back to the
 * built-in JsonProvider (same behaviour as before, backward-compatible).
 *
 * Key convention: `graph:<chatId>` — namespaced so multiple subsystems can
 * share a single provider without key collisions.
 */
export class PersistenceManager {
  /** Kept for backward-compat (`getDataDir` / `setDataDir` / constructor). */
  private dataDir: string;
  private provider: IWeaveProvider<SerializedSnapshot>;

  /**
   * @param dataDir  Root directory used by the default JsonProvider.
   *                 Ignored when an explicit `provider` is supplied.
   * @param provider Optional storage provider. Defaults to `JsonProvider(dataDir)`.
   */
  constructor(
    dataDir: string = "./weave-data",
    provider?: IWeaveProvider<SerializedSnapshot>
  ) {
    this.dataDir = dataDir;
    this.provider = provider ?? new JsonProvider<SerializedSnapshot>(dataDir);
  }

  // ── Key helpers ───────────────────────────────────────────────────────────

  private graphKey(chatId: string): string {
    return `graph:${chatId}`;
  }

  /**
   * Serialize a GraphSnapshot to a plain object (dates → ISO strings).
   */
  private serialize(snapshot: GraphSnapshot): SerializedSnapshot {
    return {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        createdAt: snapshot.metadata.createdAt.toISOString(),
        updatedAt: snapshot.metadata.updatedAt.toISOString(),
      },
      nodes: Object.fromEntries(
        Object.entries(snapshot.nodes).map(([id, node]) => [
          id,
          {
            ...node,
            createdAt: node.createdAt.toISOString(),
            updatedAt: node.updatedAt.toISOString(),
          },
        ])
      ),
      edges: Object.fromEntries(
        Object.entries(snapshot.edges).map(([id, edge]) => [
          id,
          {
            ...edge,
            createdAt: edge.createdAt.toISOString(),
            updatedAt: edge.updatedAt.toISOString(),
          },
        ])
      ),
    } as SerializedSnapshot;
  }

  /**
   * Deserialize a plain object back to a GraphSnapshot (ISO strings → dates).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deserialize(parsed: any): GraphSnapshot {
    return {
      ...parsed,
      metadata: {
        ...parsed.metadata,
        createdAt: new Date(parsed.metadata.createdAt),
        updatedAt: new Date(parsed.metadata.updatedAt),
      },
      nodes: Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(parsed.nodes).map(([id, node]: [string, any]) => [
          id,
          { ...node, createdAt: new Date(node.createdAt), updatedAt: new Date(node.updatedAt) },
        ])
      ),
      edges: Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(parsed.edges).map(([id, edge]: [string, any]) => [
          id,
          { ...edge, createdAt: new Date(edge.createdAt), updatedAt: new Date(edge.updatedAt) },
        ])
      ),
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Ensure the data directory exists.
   * Delegates to the OS mkdir so callers that relied on the old
   * PersistenceManager behaviour continue to work unchanged.
   */
  async ensureDataDir(): Promise<void> {
    const { promises: fsp } = await import('fs');
    await fsp.mkdir(this.dataDir, { recursive: true });
  }

  /**
   * Save a graph snapshot via the configured provider.
   */
  async saveGraph(snapshot: GraphSnapshot): Promise<void> {
    await this.provider.set(this.graphKey(snapshot.metadata.chatId), this.serialize(snapshot));
  }

  /**
   * Load a graph snapshot from the configured provider.
   * Returns `null` if the snapshot does not exist.
   */
  async loadGraph(chatId: string): Promise<GraphSnapshot | null> {
    const raw = await this.provider.get(this.graphKey(chatId));
    if (raw === null) return null;
    return this.deserialize(raw);
  }

  /**
   * Load or create a graph manager for a chat session.
   */
  async loadOrCreateGraph(
    chatId: string,
    compressionThreshold?: number
  ): Promise<ContextGraphManager> {
    const snapshot = await this.loadGraph(chatId);
    if (snapshot) return ContextGraphManager.fromSnapshot(snapshot);
    return new ContextGraphManager(chatId, compressionThreshold);
  }

  /**
   * Check whether a graph exists in the provider.
   */
  async graphExists(chatId: string): Promise<boolean> {
    return (await this.provider.get(this.graphKey(chatId))) !== null;
  }

  /**
   * Delete a graph from the provider. No-op if it does not exist.
   */
  async deleteGraph(chatId: string): Promise<void> {
    await this.provider.delete(this.graphKey(chatId));
  }

  /**
   * List all saved chat sessions by querying the `graph:` namespace.
   */
  async listSessions(): Promise<
    Array<{
      chatId: string;
      createdAt: Date;
      updatedAt: Date;
      nodeCount: number;
      edgeCount: number;
    }>
  > {
    const keys = await this.provider.list("graph:");
    const sessions = await Promise.all(
      keys.map(async (key) => {
        const chatId = key.replace(/^graph:/, "");
        const snapshot = await this.loadGraph(chatId);
        if (!snapshot) return null;
        return {
          chatId,
          createdAt: snapshot.metadata.createdAt,
          updatedAt: snapshot.metadata.updatedAt,
          nodeCount: Object.keys(snapshot.nodes).length,
          edgeCount: Object.keys(snapshot.edges).length,
        };
      })
    );
    return sessions.filter((s): s is NonNullable<typeof s> => s !== null);
  }

  /**
   * Swap in a different provider at runtime (e.g. after migration).
   */
  setProvider(provider: IWeaveProvider<SerializedSnapshot>): void {
    this.provider = provider;
  }

  /** Returns the active provider (useful for tests / diagnostics). */
  getProvider(): IWeaveProvider<SerializedSnapshot> {
    return this.provider;
  }

  /**
   * Change the data directory used by the default JsonProvider.
   * Has no effect when an external provider was injected.
   */
  setDataDir(newDataDir: string): void {
    this.dataDir = newDataDir;
    // Re-create the default provider so the new path takes effect
    if (!(this.provider instanceof JsonProvider)) return;
    this.provider = new JsonProvider<SerializedSnapshot>(newDataDir);
  }

  /** Returns the configured data directory. */
  getDataDir(): string {
    return this.dataDir;
  }
}
