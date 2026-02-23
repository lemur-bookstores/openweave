/**
 * Tool Loader
 *
 * Discovers ToolManifest descriptors from:
 *   1. `.weave/tools/*.tool.json` — local project manifests
 *   2. npm packages under `node_modules/@openweave-tools/` — community adapters
 *
 * Injectable FS functions for test isolation.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest, type ToolManifest, type ManifestValidationResult } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadResult {
  manifests: ToolManifest[];
  errors: Array<{ source: string; error: string }>;
}

export interface FsAdapter {
  existsSync: typeof existsSync;
  readdirSync: typeof readdirSync;
  readFileSync: typeof readFileSync;
}

const DEFAULT_FS: FsAdapter = { existsSync, readdirSync, readFileSync };

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export function loadManifestFile(
  filePath: string,
  fs: FsAdapter = DEFAULT_FS,
): { manifest: ToolManifest | null; error: string | null } {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8') as string;
  } catch (err) {
    return { manifest: null, error: `Cannot read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { manifest: null, error: `Invalid JSON in ${filePath}` };
  }

  const validation: ManifestValidationResult = validateManifest(parsed);
  if (!validation.valid) {
    return { manifest: null, error: `Validation failed: ${validation.errors.join('; ')}` };
  }

  return { manifest: parsed as ToolManifest, error: null };
}

/** Scans `.weave/tools/` directory for `*.tool.json` files. */
export function loadLocalManifests(
  projectRoot: string,
  fs: FsAdapter = DEFAULT_FS,
): LoadResult {
  const toolsDir = join(projectRoot, '.weave', 'tools');
  const result: LoadResult = { manifests: [], errors: [] };

  if (!fs.existsSync(toolsDir)) return result;

  let entries: string[];
  try {
    entries = fs.readdirSync(toolsDir) as string[];
  } catch (err) {
    result.errors.push({ source: toolsDir, error: String(err) });
    return result;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.tool.json')) continue;
    const filePath = join(toolsDir, entry);
    const { manifest, error } = loadManifestFile(filePath, fs);
    if (error) {
      result.errors.push({ source: filePath, error });
    } else if (manifest) {
      result.manifests.push(manifest);
    }
  }

  return result;
}

/** Scans `node_modules/@openweave-tools/` for community adapter packages. */
export function loadNpmManifests(
  projectRoot: string,
  fs: FsAdapter = DEFAULT_FS,
): LoadResult {
  const nmDir = join(projectRoot, 'node_modules', '@openweave-tools');
  const result: LoadResult = { manifests: [], errors: [] };

  if (!fs.existsSync(nmDir)) return result;

  let pkgs: string[];
  try {
    pkgs = fs.readdirSync(nmDir) as string[];
  } catch {
    return result;
  }

  for (const pkg of pkgs) {
    // Each @openweave-tools/<pkg> may have an `openweave.tool.json` at its root
    const manifestPath = join(nmDir, pkg, 'openweave.tool.json');
    if (!fs.existsSync(manifestPath)) continue;

    const { manifest, error } = loadManifestFile(manifestPath, fs);
    if (error) {
      result.errors.push({ source: manifestPath, error });
    } else if (manifest) {
      result.manifests.push(manifest);
    }
  }

  return result;
}

/** Load all manifests: local + npm. */
export function loadAllManifests(
  projectRoot: string,
  fs: FsAdapter = DEFAULT_FS,
): LoadResult {
  const local = loadLocalManifests(projectRoot, fs);
  const npm = loadNpmManifests(projectRoot, fs);

  return {
    manifests: [...local.manifests, ...npm.manifests],
    errors: [...local.errors, ...npm.errors],
  };
}
