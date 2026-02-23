// M20 — Core Dev Skills
export { autoFixSkill } from './auto-fix.js';
export { codeReviewSkill } from './code-review.js';
export { testGenSkill } from './test-gen.js';
export { docsGenSkill } from './docs-gen.js';
export { refactorSkill } from './refactor.js';

// M21 — DevOps Skills
export { pipelineAwareSkill } from './pipeline-aware.js';
export { depAuditSkill } from './dep-audit.js';
export { perfProfileSkill } from './perf-profile.js';
export { containerAdvisorSkill } from './container-advisor.js';
export { deployProvisionSkill } from './deploy-provision.js';

import { autoFixSkill } from './auto-fix.js';
import { codeReviewSkill } from './code-review.js';
import { testGenSkill } from './test-gen.js';
import { docsGenSkill } from './docs-gen.js';
import { refactorSkill } from './refactor.js';
// M22 — Developer Experience Skills
export { onboardingSkill } from './onboarding.js';
export { commitComposerSkill } from './commit-composer.js';
export { contextMemorySkill } from './context-memory.js';
export { multiRepoSkill } from './multi-repo.js';
export { cliInteractiveSkill } from './cli-interactive.js';

import { pipelineAwareSkill } from './pipeline-aware.js';
import { depAuditSkill } from './dep-audit.js';
import { perfProfileSkill } from './perf-profile.js';
import { containerAdvisorSkill } from './container-advisor.js';
import { deployProvisionSkill } from './deploy-provision.js';
import { onboardingSkill } from './onboarding.js';
import { commitComposerSkill } from './commit-composer.js';
import { contextMemorySkill } from './context-memory.js';
import { multiRepoSkill } from './multi-repo.js';
import { cliInteractiveSkill } from './cli-interactive.js';

export const CORE_DEV_SKILLS = [
  autoFixSkill,
  codeReviewSkill,
  testGenSkill,
  docsGenSkill,
  refactorSkill,
];

export const DEVOPS_SKILLS = [
  pipelineAwareSkill,
  depAuditSkill,
  perfProfileSkill,
  containerAdvisorSkill,
  deployProvisionSkill,
];

export const DEV_EXPERIENCE_SKILLS = [
  onboardingSkill,
  commitComposerSkill,
  contextMemorySkill,
  multiRepoSkill,
  cliInteractiveSkill,
];
