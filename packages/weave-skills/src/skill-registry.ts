/**
 * WeaveSkills — SkillRegistry
 *
 * Central registry for all skill modules.
 * Manages lifecycle: register → enable/disable → execute.
 *
 * Usage:
 * ```typescript
 * const registry = new SkillRegistry();
 * registry.register(mySkill);
 * registry.enable('my-skill');
 * await registry.execute('my-skill', context);
 * ```
 */

import type {
  SkillModule,
  SkillContext,
  SkillResult,
  SkillConfig,
  RegisteredSkill,
} from './types.js';

export class SkillRegistry {
  private readonly _skills: Map<string, RegisteredSkill> = new Map();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a skill module.
   * If a SkillConfig has been loaded, the config's enabled flag takes priority
   * over the module's `enabled` default.
   *
   * @throws {Error} if a skill with the same id is already registered
   */
  register(module: SkillModule): void {
    if (this._skills.has(module.id)) {
      throw new Error(`Skill '${module.id}' is already registered. Use replace() to overwrite.`);
    }
    this._skills.set(module.id, {
      module,
      enabled: module.enabled,
      registeredAt: new Date(),
    });
  }

  /**
   * Register a skill module, replacing any existing entry with the same id.
   * Useful for testing and hot-reloading scenarios.
   */
  replace(module: SkillModule): void {
    const existing = this._skills.get(module.id);
    this._skills.set(module.id, {
      module,
      enabled: existing ? existing.enabled : module.enabled,
      registeredAt: existing ? existing.registeredAt : new Date(),
    });
  }

  /**
   * Unregister a skill by id.
   * @returns true if the skill existed and was removed, false otherwise
   */
  unregister(id: string): boolean {
    return this._skills.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Enable / Disable
  // ---------------------------------------------------------------------------

  /**
   * Enable a registered skill.
   * @throws {Error} if the skill is not registered
   */
  enable(id: string): void {
    const entry = this._getOrThrow(id);
    entry.enabled = true;
  }

  /**
   * Disable a registered skill.
   * @throws {Error} if the skill is not registered
   */
  disable(id: string): void {
    const entry = this._getOrThrow(id);
    entry.enabled = false;
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Returns the full registered skill entry, or undefined if not found. */
  get(id: string): RegisteredSkill | undefined {
    return this._skills.get(id);
  }

  /** Returns true if a skill with the given id is registered. */
  has(id: string): boolean {
    return this._skills.has(id);
  }

  /** Returns all registered skills (enabled and disabled). */
  list(): RegisteredSkill[] {
    return Array.from(this._skills.values());
  }

  /** Returns only enabled skills. */
  listEnabled(): SkillModule[] {
    return Array.from(this._skills.values())
      .filter((s) => s.enabled)
      .map((s) => s.module);
  }

  /** Total number of registered skills. */
  get size(): number {
    return this._skills.size;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a skill by id.
   *
   * @param id - Skill identifier
   * @param context - Runtime context injected into the skill
   * @returns SkillResult — never throws; errors are captured into result.error
   * @throws {Error} if the skill is not registered or is disabled
   */
  async execute(id: string, context: SkillContext): Promise<SkillResult> {
    const entry = this._getOrThrow(id);

    if (!entry.enabled) {
      throw new Error(`Skill '${id}' is disabled. Enable it first with registry.enable('${id}').`);
    }

    try {
      return await entry.module.execute(context);
    } catch (err) {
      return {
        success: false,
        output: `Skill '${id}' threw an unexpected error`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Execute a skill by id, returning a failed SkillResult instead of throwing
   * if the skill is not registered or is disabled.
   * Useful for fire-and-forget scenarios where you don't want to handle missing skills.
   */
  async executeSafe(id: string, context: SkillContext): Promise<SkillResult> {
    const entry = this._skills.get(id);

    if (!entry) {
      return { success: false, output: '', error: `Skill '${id}' is not registered.` };
    }

    if (!entry.enabled) {
      return { success: false, output: '', error: `Skill '${id}' is disabled.` };
    }

    try {
      return await entry.module.execute(context);
    } catch (err) {
      return {
        success: false,
        output: `Skill '${id}' threw an unexpected error`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Execute all currently enabled skills in registration order.
   * Skills that throw are caught and returned as failed results — they never
   * block execution of subsequent skills.
   *
   * @param context - Runtime context shared across all skills
   * @returns Map of skill id → SkillResult
   */
  async executeAll(context: SkillContext): Promise<Map<string, SkillResult>> {
    const results = new Map<string, SkillResult>();

    for (const entry of this._skills.values()) {
      if (!entry.enabled) continue;

      try {
        results.set(entry.module.id, await entry.module.execute(context));
      } catch (err) {
        results.set(entry.module.id, {
          success: false,
          output: `Skill '${entry.module.id}' threw an unexpected error`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Config integration
  // ---------------------------------------------------------------------------

  /**
   * Apply a SkillConfig to the registry.
   *
   * - Skills present in config.skills are enabled/disabled accordingly.
   * - Skills not mentioned in config are left at their current state.
   * - Skills in config that are not yet registered are silently ignored
   *   (they will be applied when registered later via register()).
   */
  loadFromConfig(config: SkillConfig): void {
    for (const [id, enabled] of Object.entries(config.skills)) {
      const entry = this._skills.get(id);
      if (entry) {
        entry.enabled = enabled;
      }
    }
  }

  /**
   * Produce a SkillConfig snapshot from the current registry state.
   * Useful for serialising the registry to `.weave.config.json`.
   */
  toConfig(): SkillConfig {
    const skills: Record<string, boolean> = {};
    for (const [id, entry] of this._skills.entries()) {
      skills[id] = entry.enabled;
    }
    return { skills };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _getOrThrow(id: string): RegisteredSkill {
    const entry = this._skills.get(id);
    if (!entry) {
      throw new Error(`Skill '${id}' is not registered.`);
    }
    return entry;
  }
}
