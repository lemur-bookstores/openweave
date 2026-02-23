/**
 * WeaveSkills — Config Loader
 *
 * Reads and writes the `skills` section of `.weave.config.json`.
 * All I/O is synchronous to keep it usable in CLI and agent init paths.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SkillConfig, WeaveConfig } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the config file, located at the project root (not inside .weave/). */
export const CONFIG_FILENAME = '.weave.config.json';

/** A SkillConfig with no skills registered. */
export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  skills: {},
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the SkillConfig from `.weave.config.json` in the given project root.
 * Returns DEFAULT_SKILL_CONFIG if the file does not exist or has no `skills` key.
 *
 * @param projectRoot - Absolute or relative path to the project root (default: cwd)
 */
export function loadSkillConfig(projectRoot?: string): SkillConfig {
  const root = resolve(projectRoot ?? process.cwd());
  const configPath = _configPath(root);

  if (!existsSync(configPath)) {
    return { skills: {} };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: WeaveConfig = JSON.parse(raw);
    return {
      skills: parsed.skills ?? {},
    };
  } catch {
    // Invalid JSON — return empty config rather than crashing
    return { skills: {} };
  }
}

/**
 * Load the full `.weave.config.json` object (all keys, not just skills).
 * Returns an empty object if the file does not exist.
 */
export function loadWeaveConfig(projectRoot?: string): WeaveConfig {
  const root = resolve(projectRoot ?? process.cwd());
  const configPath = _configPath(root);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as WeaveConfig;
  } catch {
    return {};
  }
}

/**
 * Persist a SkillConfig into `.weave.config.json`.
 * Merges with any existing keys in the file so other sections are preserved.
 *
 * @param config     - The SkillConfig to save
 * @param projectRoot - Absolute or relative path to the project root (default: cwd)
 */
export function saveSkillConfig(config: SkillConfig, projectRoot?: string): void {
  const root = resolve(projectRoot ?? process.cwd());
  const configPath = _configPath(root);

  // Read existing config to preserve non-skills keys
  const existing = loadWeaveConfig(root);
  const merged: WeaveConfig = {
    ...existing,
    skills: config.skills,
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

/**
 * Enable or disable a single skill in `.weave.config.json`.
 * Creates the config file if it does not exist.
 *
 * @param skillId     - The skill identifier (e.g. 'auto-fix')
 * @param enabled     - true to enable, false to disable
 * @param projectRoot - Project root (default: cwd)
 */
export function setSkillEnabled(skillId: string, enabled: boolean, projectRoot?: string): void {
  const existing = loadSkillConfig(projectRoot);
  const updated: SkillConfig = {
    skills: { ...existing.skills, [skillId]: enabled },
  };
  saveSkillConfig(updated, projectRoot);
}

/**
 * Merge a partial SkillConfig update into the existing config and persist.
 *
 * @param updates     - Partial skills map to merge
 * @param projectRoot - Project root (default: cwd)
 */
export function mergeSkillConfig(
  updates: Partial<SkillConfig>,
  projectRoot?: string
): SkillConfig {
  const existing = loadSkillConfig(projectRoot);
  const merged: SkillConfig = {
    skills: { ...existing.skills, ...(updates.skills ?? {}) },
  };
  saveSkillConfig(merged, projectRoot);
  return merged;
}

/**
 * Returns true if `.weave.config.json` exists in the given project root.
 */
export function configExists(projectRoot?: string): boolean {
  const root = resolve(projectRoot ?? process.cwd());
  return existsSync(_configPath(root));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _configPath(root: string): string {
  return join(root, CONFIG_FILENAME);
}
