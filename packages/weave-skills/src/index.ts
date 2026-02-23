/**
 * @openweave/weave-skills
 *
 * Skill Module Registry — M19
 * Provides the infrastructure for registering, activating and composing
 * optional skill modules in the OpenWeave agent.
 */

// Types
export type {
  SkillModule,
  SkillContext,
  SkillGitContext,
  SkillResult,
  SkillConfig,
  WeaveConfig,
  RegisteredSkill,
} from './types.js';

// Registry
export { SkillRegistry } from './skill-registry.js';

// Config helpers
export {
  CONFIG_FILENAME,
  DEFAULT_SKILL_CONFIG,
  loadSkillConfig,
  loadWeaveConfig,
  saveSkillConfig,
  setSkillEnabled,
  mergeSkillConfig,
  configExists,
} from './config-loader.js';

// Core Dev Skills (M20)
export {
  autoFixSkill,
  codeReviewSkill,
  testGenSkill,
  docsGenSkill,
  refactorSkill,
  CORE_DEV_SKILLS,
} from './skills/index.js';
