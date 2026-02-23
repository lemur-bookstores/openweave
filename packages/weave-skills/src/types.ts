/**
 * WeaveSkills — Type Definitions
 *
 * Core contracts for the Skill Module system (M19).
 * All skill modules implement SkillModule; the registry manages their lifecycle.
 */

// ---------------------------------------------------------------------------
// Skill execution context — injected into every skill.execute() call
// ---------------------------------------------------------------------------

/** Git state available to skills that need to inspect staged/unstaged changes. */
export interface SkillGitContext {
  /** Current branch name */
  branch: string;
  /** Paths of staged files (`git diff --name-only --cached`) */
  stagedFiles: string[];
  /** Paths of unstaged modified files */
  unstagedFiles: string[];
  /** Full diff of staged changes (may be truncated) */
  stagedDiff: string;
}

/**
 * Context object injected into every skill at execution time.
 * Skills may use any subset — unused fields can be null when unavailable.
 */
export interface SkillContext {
  /** Absolute path to the project root */
  projectRoot: string;
  /** File paths in the project (relative to projectRoot) */
  files: string[];
  /**
   * Opaque knowledge-graph snapshot.
   * Typed as unknown to avoid a circular dependency on @openweave/weave-graph.
   * Skills that need the graph should cast to the WeaveGraph types they import.
   */
  graph: unknown | null;
  /** Active session metadata */
  session: { id: string; chatId?: string } | null;
  /** Git workspace state — null if not a git repository */
  git: SkillGitContext | null;
}

// ---------------------------------------------------------------------------
// Skill result
// ---------------------------------------------------------------------------

/** Structured result returned by every skill execution. */
export interface SkillResult {
  /** Whether the skill completed successfully */
  success: boolean;
  /** Human-readable summary of the outcome (for CLI / agent logging) */
  output: string;
  /** Arbitrary structured payload — skill-specific */
  data?: unknown;
  /** Error message when success === false */
  error?: string;
}

// ---------------------------------------------------------------------------
// Skill module contract
// ---------------------------------------------------------------------------

/**
 * Base contract every skill module must implement.
 *
 * @example
 * ```typescript
 * import type { SkillModule, SkillContext, SkillResult } from '@openweave/weave-skills';
 *
 * export const mySkill: SkillModule = {
 *   id: 'my-skill',
 *   name: 'My Skill',
 *   description: 'Does something useful',
 *   version: '1.0.0',
 *   enabled: true,
 *   tags: ['dev'],
 *   async execute(ctx: SkillContext): Promise<SkillResult> {
 *     return { success: true, output: 'done' };
 *   },
 * };
 * ```
 */
export interface SkillModule {
  /** Unique kebab-case identifier (e.g. 'auto-fix', 'code-review') */
  id: string;
  /** Display name */
  name: string;
  /** Short description shown in `weave skills list` */
  description: string;
  /** Semver string */
  version: string;
  /**
   * Whether this skill is active by default when first registered.
   * The registry always defers to the loaded SkillConfig over this value.
   */
  enabled: boolean;
  /** Optional categorisation tags ('dev' | 'devops' | 'dx' | 'custom') */
  tags?: string[];
  /**
   * Execute the skill.
   * @param context - Runtime context (files, graph, session, git)
   * @returns Structured result with success flag, output message and optional data
   */
  execute(context: SkillContext): Promise<SkillResult>;
}

// ---------------------------------------------------------------------------
// Registry internals
// ---------------------------------------------------------------------------

/** Internal record maintained by SkillRegistry for each registered skill. */
export interface RegisteredSkill {
  module: SkillModule;
  /** Current enabled state — authoritative source of truth at runtime */
  enabled: boolean;
  /** When the skill was registered in this process */
  registeredAt: Date;
}

// ---------------------------------------------------------------------------
// Configuration (.weave.config.json → "skills" section)
// ---------------------------------------------------------------------------

/**
 * Persisted skill configuration stored in `.weave.config.json`.
 *
 * @example
 * ```json
 * {
 *   "skills": {
 *     "auto-fix": true,
 *     "code-review": false,
 *     "test-gen": true
 *   }
 * }
 * ```
 */
export interface SkillConfig {
  /** Map of skill id → enabled flag */
  skills: Record<string, boolean>;
}

/**
 * Shape of the full `.weave.config.json` file.
 * Only the `skills` section is managed by weave-skills; other properties are preserved.
 */
export interface WeaveConfig {
  /** Project name */
  projectName?: string;
  /** Skill enable/disable flags */
  skills?: Record<string, boolean>;
  /** Other config keys are preserved verbatim */
  [key: string]: unknown;
}
