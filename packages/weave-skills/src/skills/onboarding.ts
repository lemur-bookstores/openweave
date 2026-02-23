/**
 * Skill: onboarding
 *
 * Generates an interactive onboarding tour for new developers:
 *   - Annotated project tree
 *   - Primary data-flow description
 *   - Startup commands (from package.json scripts)
 *   - Basic FAQ
 *
 * Input (via SkillContext.graph or ctx.files):
 *   - `ctx.graph['format']`     — 'markdown' | 'text' (default: 'markdown')
 *   - `ctx.graph['pkgJson']`    — parsed package.json object (injectable for tests)
 *   - `ctx.graph['readmeText']` — README.md content (injectable for tests)
 *   - `ctx.graph['fileTree']`   — string[] of relative file paths (overrides ctx.files)
 *
 * Output data:
 *   - OnboardingReport
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillModule, SkillContext, SkillResult } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeNode {
  name: string;
  isDir: boolean;
  annotation?: string;
}

export interface StartupCommand {
  name: string;
  command: string;
  description: string;
}

export interface OnboardingReport {
  projectName: string;
  description: string;
  tree: TreeNode[];
  dataFlow: string[];
  startupCommands: StartupCommand[];
  faq: Array<{ q: string; a: string }>;
  format: 'markdown' | 'text';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIR_ANNOTATIONS: Record<string, string> = {
  'src': 'Source code',
  'packages': 'Workspace packages (monorepo)',
  'apps': 'Application entry points',
  'docs': 'Documentation',
  'scripts': 'Dev & deploy scripts',
  'tests': 'Test suites',
  '__tests__': 'Test suites',
  'dist': 'Compiled output (generated)',
  'node_modules': 'Dependencies (generated)',
  '.github': 'CI/CD workflows',
  '.weave': 'OpenWeave session data',
};

const FILE_ANNOTATIONS: Record<string, string> = {
  'package.json': 'Project manifest & npm scripts',
  'tsconfig.json': 'TypeScript compiler config',
  'README.md': 'Project documentation',
  'ROADMAP.md': 'Development roadmap',
  'LICENSE': 'License terms',
  '.env.example': 'Environment variable template',
  'docker-compose.yml': 'Docker services config',
  'Dockerfile': 'Container build instructions',
  'vitest.config.ts': 'Vitest test runner config',
  'pnpm-workspace.yaml': 'pnpm workspace definition',
};

export function buildTreeNodes(files: string[]): TreeNode[] {
  const seen = new Set<string>();
  const nodes: TreeNode[] = [];

  for (const f of files) {
    const parts = f.split('/');
    // Add top-level dirs & files
    const top = parts[0];
    if (!seen.has(top)) {
      seen.add(top);
      const isDir = parts.length > 1;
      nodes.push({
        name: top,
        isDir,
        annotation: isDir ? DIR_ANNOTATIONS[top] : FILE_ANNOTATIONS[top],
      });
    }
  }

  return nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function extractStartupCommands(
  scripts: Record<string, string>,
): StartupCommand[] {
  const KNOWN: Record<string, string> = {
    dev: 'Start development server with hot-reload',
    start: 'Start production server',
    build: 'Compile TypeScript / bundle assets',
    test: 'Run test suite',
    lint: 'Run linter (ESLint / tsc --noEmit)',
    format: 'Format source files (Prettier)',
    clean: 'Remove build artifacts',
  };

  return Object.entries(scripts)
    .filter(([name]) => KNOWN[name] !== undefined)
    .map(([name, _command]) => ({
      name,
      command: `pnpm ${name}`,
      description: KNOWN[name]!,
    }));
}

export function buildDataFlow(files: string[]): string[] {
  const hasMcp = files.some((f) => f.includes('mcp-server') || f.includes('weave-link'));
  const hasAgent = files.some((f) => f.includes('agent-core') || f.includes('AgentCore'));
  const hasGraph = files.some((f) => f.includes('weave-graph') || f.includes('WeaveGraph'));
  const hasEmbed = files.some((f) => f.includes('weave-embed'));
  const hasDash = files.some((f) => f.includes('weave-dashboard') || f.includes('dashboard'));

  const flow: string[] = [];
  if (hasAgent) flow.push('User input → AgentCore (ReAct loop)');
  if (hasMcp) flow.push('AgentCore → ToolRegistry → WeaveLink MCP Server');
  if (hasGraph) flow.push('Tool calls → WeaveGraph (knowledge persistence)');
  if (hasEmbed) flow.push('WeaveGraph ↔ EmbeddingService (semantic search)');
  if (hasDash) flow.push('WeaveGraph → Dashboard (REST API + SSE)');
  if (flow.length === 0) flow.push('See README.md for architecture overview');
  return flow;
}

const DEFAULT_FAQ = [
  {
    q: 'How do I start the project?',
    a: 'Run `pnpm install` then `pnpm dev` (or `pnpm start`) in the repo root.',
  },
  {
    q: 'How do I run tests?',
    a: 'Run `pnpm test` in the repo root, or `pnpm --filter <package> test` for a single package.',
  },
  {
    q: 'Where is the configuration?',
    a: 'Project config lives in `.weave.config.json` at the repo root. Copy `.env.example` to `.env` for secrets.',
  },
  {
    q: 'How do I add a new skill?',
    a: 'Create a new file in `packages/weave-skills/src/skills/`, export a `SkillModule`, and register it in the barrel index.',
  },
];

export function renderMarkdown(report: OnboardingReport): string {
  const lines: string[] = [
    `# 👋 Welcome to **${report.projectName}**`,
    '',
    `> ${report.description}`,
    '',
    '## 📁 Project Structure',
    '',
    ...report.tree.map(
      (n) =>
        `- ${n.isDir ? '📂' : '📄'} \`${n.name}${n.isDir ? '/' : ''}\`${n.annotation ? ` — ${n.annotation}` : ''}`,
    ),
    '',
    '## 🔄 Data Flow',
    '',
    ...report.dataFlow.map((line) => `1. ${line}`),
    '',
    '## 🚀 Getting Started',
    '',
    ...report.startupCommands.map(
      (cmd) => `- \`${cmd.command}\` — ${cmd.description}`,
    ),
    '',
    '## ❓ FAQ',
    '',
    ...report.faq.flatMap((item) => [`**Q: ${item.q}**`, `A: ${item.a}`, '']),
  ];
  return lines.join('\n');
}

export function renderText(report: OnboardingReport): string {
  const lines: string[] = [
    `Welcome to ${report.projectName}`,
    `${'='.repeat(report.projectName.length + 11)}`,
    '',
    report.description,
    '',
    'PROJECT STRUCTURE',
    '-----------------',
    ...report.tree.map(
      (n) => `  ${n.name}${n.isDir ? '/' : ''}${n.annotation ? ` (${n.annotation})` : ''}`,
    ),
    '',
    'DATA FLOW',
    '---------',
    ...report.dataFlow.map((l, i) => `  ${i + 1}. ${l}`),
    '',
    'GETTING STARTED',
    '---------------',
    ...report.startupCommands.map((cmd) => `  ${cmd.command}  — ${cmd.description}`),
    '',
    'FAQ',
    '---',
    ...report.faq.flatMap((item) => [`Q: ${item.q}`, `A: ${item.a}`, '']),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const onboardingSkill: SkillModule = {
  id: 'onboarding',
  name: 'Onboarding Tour Generator',
  description:
    'Generates an annotated project tree, data-flow overview, startup commands and FAQ for new developers.',
  version: '1.0.0',
  enabled: true,
  tags: ['dx', 'documentation', 'onboarding'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const graph = (ctx.graph ?? {}) as Record<string, unknown>;
    const format: 'markdown' | 'text' =
      (graph['format'] as 'markdown' | 'text') ?? 'markdown';

    // --- Load package.json ---
    let pkgName = 'Project';
    let pkgDescription = 'No description provided.';
    let scripts: Record<string, string> = {};

    if (graph['pkgJson']) {
      const pkg = graph['pkgJson'] as Record<string, unknown>;
      pkgName = (pkg['name'] as string) ?? pkgName;
      pkgDescription = (pkg['description'] as string) ?? pkgDescription;
      scripts = (pkg['scripts'] as Record<string, string>) ?? {};
    } else {
      const pkgPath = join(ctx.projectRoot, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
          pkgName = (pkg['name'] as string) ?? pkgName;
          pkgDescription = (pkg['description'] as string) ?? pkgDescription;
          scripts = (pkg['scripts'] as Record<string, string>) ?? {};
        } catch {
          // ignore parse errors
        }
      }
    }

    // Override description from README if available
    if (!graph['pkgJson'] && graph['readmeText']) {
      const firstLine = (graph['readmeText'] as string).split('\n').find((l) => l.trim() && !l.startsWith('#'));
      if (firstLine) pkgDescription = firstLine.trim();
    }

    // --- File tree ---
    const rawFiles: string[] = Array.isArray(graph['fileTree'])
      ? (graph['fileTree'] as string[])
      : ctx.files;

    const tree = buildTreeNodes(rawFiles);
    const dataFlow = buildDataFlow(rawFiles);
    const startupCommands = extractStartupCommands(scripts);

    const report: OnboardingReport = {
      projectName: pkgName,
      description: pkgDescription,
      tree,
      dataFlow,
      startupCommands,
      faq: DEFAULT_FAQ,
      format,
    };

    const rendered = format === 'markdown' ? renderMarkdown(report) : renderText(report);

    return {
      success: true,
      output: `Onboarding tour generated for "${pkgName}" — ${tree.length} tree nodes, ${startupCommands.length} startup commands`,
      data: { report, rendered },
    };
  },
};
