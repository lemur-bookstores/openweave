export { autoFixSkill } from './auto-fix.js';
export { codeReviewSkill } from './code-review.js';
export { testGenSkill } from './test-gen.js';
export { docsGenSkill } from './docs-gen.js';
export { refactorSkill } from './refactor.js';

import { autoFixSkill } from './auto-fix.js';
import { codeReviewSkill } from './code-review.js';
import { testGenSkill } from './test-gen.js';
import { docsGenSkill } from './docs-gen.js';
import { refactorSkill } from './refactor.js';

export const CORE_DEV_SKILLS = [
  autoFixSkill,
  codeReviewSkill,
  testGenSkill,
  docsGenSkill,
  refactorSkill,
];
