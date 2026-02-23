/**
 * @openweave/weave-tools
 *
 * External Tool Registry & Adapters — M24
 * Enables users and developers to register any external tool and expose it
 * to the OpenWeave agent as if it were a native tool.
 */

// Types
export {
  validateManifest,
  type AdapterType,
  type AuthType,
  type ToolAuth,
  type ToolInputSchema,
  type ToolAction,
  type ToolManifest,
  type ManifestValidationResult,
  type ToolCallResult,
  type ToolHandler,
  type RegisteredExternalTool,
} from './types.js';

// Adapters
export {
  buildAuthHeaders,
  createHttpHandler,
  createHttpAdapter,
  type FetchFn,
  type HttpAdapterOptions,
} from './adapters/http-adapter.js';

export {
  createMcpHandler,
  createMcpAdapter,
} from './adapters/mcp-adapter.js';

export {
  runScript,
  createScriptHandler,
  createScriptAdapter,
  type SpawnFn,
} from './adapters/script-adapter.js';

// Loader
export {
  loadManifestFile,
  loadLocalManifests,
  loadNpmManifests,
  loadAllManifests,
  type LoadResult,
  type FsAdapter as LoaderFsAdapter,
} from './tool-loader.js';

// Store
export {
  ToolStore,
  createToolStore,
  type ToolStoreData,
} from './tool-store.js';

// Bridge
export {
  ExternalToolBridge,
  type ToolRegistryLike,
} from './tool-bridge.js';
