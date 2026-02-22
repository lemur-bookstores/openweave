import { promises as fs } from "fs";
import * as path from "path";
import { ContextGraphManager } from "./index";
import { GraphSnapshot } from "./types";

/**
 * PersistenceManager
 * Handles saving and loading graph snapshots to/from disk
 * Organizes files by chat_id in a configurable data directory
 */
export class PersistenceManager {
  private dataDir: string;

  constructor(dataDir: string = "./weave-data") {
    this.dataDir = dataDir;
  }

  /**
   * Get the file path for a given chat_id
   */
  private getFilePath(chatId: string): string {
    const sanitizedId = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dataDir, `${sanitizedId}.json`);
  }

  /**
   * Ensure the data directory exists
   */
  async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Save a graph snapshot to disk
   */
  async saveGraph(snapshot: GraphSnapshot): Promise<void> {
    await this.ensureDataDir();

    const filePath = this.getFilePath(snapshot.metadata.chatId);
    const serialized = {
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
    };

    await fs.writeFile(filePath, JSON.stringify(serialized, null, 2), "utf-8");
  }

  /**
   * Load a graph snapshot from disk
   */
  async loadGraph(chatId: string): Promise<GraphSnapshot | null> {
    const filePath = this.getFilePath(chatId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      // Deserialize dates
      return {
        ...parsed,
        metadata: {
          ...parsed.metadata,
          createdAt: new Date(parsed.metadata.createdAt),
          updatedAt: new Date(parsed.metadata.updatedAt),
        },
        nodes: Object.fromEntries(
          Object.entries(parsed.nodes).map(([id, node]: [string, any]) => [
            id,
            {
              ...node,
              createdAt: new Date(node.createdAt),
              updatedAt: new Date(node.updatedAt),
            },
          ])
        ),
        edges: Object.fromEntries(
          Object.entries(parsed.edges).map(([id, edge]: [string, any]) => [
            id,
            {
              ...edge,
              createdAt: new Date(edge.createdAt),
              updatedAt: new Date(edge.updatedAt),
            },
          ])
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Load or create a graph manager for a chat session
   */
  async loadOrCreateGraph(
    chatId: string,
    compressionThreshold?: number
  ): Promise<ContextGraphManager> {
    const snapshot = await this.loadGraph(chatId);

    if (snapshot) {
      return ContextGraphManager.fromSnapshot(snapshot);
    }

    return new ContextGraphManager(chatId, compressionThreshold);
  }

  /**
   * Check if a graph exists on disk
   */
  async graphExists(chatId: string): Promise<boolean> {
    const filePath = this.getFilePath(chatId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a graph from disk
   */
  async deleteGraph(chatId: string): Promise<void> {
    const filePath = this.getFilePath(chatId);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  /**
   * List all saved chat sessions
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
    await this.ensureDataDir();

    try {
      const files = await fs.readdir(this.dataDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      const sessions = await Promise.all(
        jsonFiles.map(async (file) => {
          const chatId = file.replace(".json", "");
          const snapshot = await this.loadGraph(chatId);

          if (!snapshot) {
            return null;
          }

          return {
            chatId,
            createdAt: snapshot.metadata.createdAt,
            updatedAt: snapshot.metadata.updatedAt,
            nodeCount: Object.keys(snapshot.nodes).length,
            edgeCount: Object.keys(snapshot.edges).length,
          };
        })
      );

      return sessions.filter((s) => s !== null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Change the data directory
   */
  setDataDir(newDataDir: string): void {
    this.dataDir = newDataDir;
  }

  /**
   * Get the current data directory
   */
  getDataDir(): string {
    return this.dataDir;
  }
}
