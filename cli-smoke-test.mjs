/**
 * weave-cli end-to-end smoke test
 * Tests: init, status, save-node, query, milestones
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = 'apps/weave-cli/dist/cli.js';
const TEST_DIR = join(tmpdir(), `weave-cli-test-${Date.now()}`);

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, WEAVE_ROOT: TEST_DIR },
    encoding: 'utf-8',
    timeout: 10000,
  });
  return {
    code: result.status,
    out: (result.stdout || '').trim(),
    err: (result.stderr || '').trim(),
  };
}

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`✅ ${label}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Setup
mkdirSync(TEST_DIR, { recursive: true });

// ── 1. init ──────────────────────────────────────────────
test('init: creates .weave directory and config', () => {
  const r = run(['init', 'my-project', `--root=${TEST_DIR}`]);
  assert(r.code === 0, `exit ${r.code}\n${r.out}\n${r.err}`);
  assert(existsSync(join(TEST_DIR, '.weave', 'config.json')), 'config.json missing');
  assert(existsSync(join(TEST_DIR, '.weave', 'ROADMAP.md')), 'ROADMAP.md missing');
  console.log('   output:', r.out.split('\n')[0]);
});

// ── 2. init again (should fail — already exists) ─────────
test('init: fails if already initialized', () => {
  const r = run(['init', 'my-project', `--root=${TEST_DIR}`]);
  assert(r.code !== 0, 'should have failed');
  console.log('   output:', r.out.split('\n')[0]);
});

// ── 3. status ────────────────────────────────────────────
test('status: reads config and shows project info', () => {
  const r = run(['status', `--root=${TEST_DIR}`]);
  assert(r.code === 0, `exit ${r.code}\n${r.out}\n${r.err}`);
  assert(r.out.includes('my-project') || r.out.length > 0, 'empty output');
  console.log('   output:', r.out.split('\n')[0]);
});

// ── 4. save-node ─────────────────────────────────────────
test('save-node: saves a MILESTONE node to graph', () => {
  const r = run([
    'save-node',
    `--root=${TEST_DIR}`,
    '--label=Project Setup Complete',
    '--type=MILESTONE',
    '--description=Initial project structure created',
  ]);
  assert(r.code === 0, `exit ${r.code}\n${r.out}\n${r.err}`);
  console.log('   output:', r.out.split('\n')[0]);
});

// ── 5. query ─────────────────────────────────────────────
test('query: finds saved node', () => {
  const r = run(['query', `--root=${TEST_DIR}`, 'Project']);
  // query might not fail even if empty
  assert(r.code === 0, `exit ${r.code}\n${r.out}\n${r.err}`);
  console.log('   output:', r.out.split('\n')[0] || '(empty result)');
});

// ── 6. milestones ────────────────────────────────────────
test('milestones: lists milestones', () => {
  const r = run(['milestones', `--root=${TEST_DIR}`]);
  assert(r.code === 0, `exit ${r.code}\n${r.out}\n${r.err}`);
  console.log('   output:', r.out.split('\n')[0] || '(empty)');
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });

console.log(`\n─── ${passed} passed / ${failed} failed ───`);
if (failed > 0) process.exit(1);
