/**
 * WeaveSkills — Unit Tests (M19)
 *
 * Coverage:
 *  - SkillRegistry: register, replace, unregister, enable, disable, get, has, list, size
 *  - SkillRegistry: execute, executeSafe, executeAll
 *  - SkillRegistry: loadFromConfig, toConfig
 *  - ConfigLoader: loadSkillConfig, saveSkillConfig, setSkillEnabled, mergeSkillConfig, configExists
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SkillRegistry } from './skill-registry.js';
import {
  loadSkillConfig,
  saveSkillConfig,
  setSkillEnabled,
  mergeSkillConfig,
  configExists,
  CONFIG_FILENAME,
} from './config-loader.js';
import type { SkillModule, SkillContext, SkillConfig } from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeCtx = (): SkillContext => ({
  projectRoot: '/tmp/project',
  files: ['src/index.ts'],
  graph: null,
  session: null,
  git: null,
});

const makeSkill = (
  id: string,
  enabled = true,
  result = { success: true, output: `${id} done` }
): SkillModule => ({
  id,
  name: `Skill ${id}`,
  description: `Test skill ${id}`,
  version: '1.0.0',
  enabled,
  tags: ['test'],
  async execute(_ctx) {
    return result;
  },
});

// ---------------------------------------------------------------------------
// SkillRegistry — registration
// ---------------------------------------------------------------------------

describe('SkillRegistry — register / unregister', () => {
  it('registers a skill and finds it', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('alpha'));
    expect(reg.has('alpha')).toBe(true);
    expect(reg.get('alpha')?.module.id).toBe('alpha');
  });

  it('size reflects number of registered skills', () => {
    const reg = new SkillRegistry();
    expect(reg.size).toBe(0);
    reg.register(makeSkill('a'));
    reg.register(makeSkill('b'));
    expect(reg.size).toBe(2);
  });

  it('throws when registering a duplicate id', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('dup'));
    expect(() => reg.register(makeSkill('dup'))).toThrow("Skill 'dup' is already registered");
  });

  it('replace() overwrites without throwing', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('s1', true));
    expect(() => reg.replace(makeSkill('s1', false))).not.toThrow();
    // enabled state preserved from existing entry
    expect(reg.get('s1')?.enabled).toBe(true);
  });

  it('replace() creates entry if not yet registered', () => {
    const reg = new SkillRegistry();
    reg.replace(makeSkill('new-skill'));
    expect(reg.has('new-skill')).toBe(true);
  });

  it('unregister removes a skill', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('rem'));
    expect(reg.unregister('rem')).toBe(true);
    expect(reg.has('rem')).toBe(false);
  });

  it('unregister returns false for unknown id', () => {
    const reg = new SkillRegistry();
    expect(reg.unregister('ghost')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SkillRegistry — enable / disable
// ---------------------------------------------------------------------------

describe('SkillRegistry — enable / disable', () => {
  it('newly registered skill has enabled from module default', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('on', true));
    expect(reg.get('on')?.enabled).toBe(true);
    reg.register(makeSkill('off', false));
    expect(reg.get('off')?.enabled).toBe(false);
  });

  it('enable() sets enabled to true', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('s', false));
    reg.enable('s');
    expect(reg.get('s')?.enabled).toBe(true);
  });

  it('disable() sets enabled to false', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('s', true));
    reg.disable('s');
    expect(reg.get('s')?.enabled).toBe(false);
  });

  it('enable() throws for unregistered skill', () => {
    const reg = new SkillRegistry();
    expect(() => reg.enable('ghost')).toThrow("Skill 'ghost' is not registered");
  });

  it('disable() throws for unregistered skill', () => {
    const reg = new SkillRegistry();
    expect(() => reg.disable('ghost')).toThrow("Skill 'ghost' is not registered");
  });

  it('list() returns all skills; listEnabled() returns only enabled', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('a', true));
    reg.register(makeSkill('b', false));
    reg.register(makeSkill('c', true));
    expect(reg.list().length).toBe(3);
    const enabled = reg.listEnabled();
    expect(enabled.length).toBe(2);
    expect(enabled.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

// ---------------------------------------------------------------------------
// SkillRegistry — execute
// ---------------------------------------------------------------------------

describe('SkillRegistry — execute', () => {
  it('executes an enabled skill', async () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('runner', true, { success: true, output: 'ok' }));
    const result = await reg.execute('runner', makeCtx());
    expect(result.success).toBe(true);
    expect(result.output).toBe('ok');
  });

  it('throws when trying to execute a disabled skill', async () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('sleeping', false));
    await expect(reg.execute('sleeping', makeCtx())).rejects.toThrow(
      "Skill 'sleeping' is disabled"
    );
  });

  it('throws when skill is not registered', async () => {
    const reg = new SkillRegistry();
    await expect(reg.execute('ghost', makeCtx())).rejects.toThrow("Skill 'ghost' is not registered");
  });

  it('captures thrown error inside execute() and returns failed result', async () => {
    const reg = new SkillRegistry();
    const throwing: SkillModule = {
      id: 'boom',
      name: 'Boom',
      description: 'throws',
      version: '1.0.0',
      enabled: true,
      async execute() {
        throw new Error('kaboom');
      },
    };
    reg.register(throwing);
    const result = await reg.execute('boom', makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toBe('kaboom');
  });

  it('executeSafe returns failed result for unregistered skill (no throw)', async () => {
    const reg = new SkillRegistry();
    const result = await reg.executeSafe('ghost', makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('not registered');
  });
});

// ---------------------------------------------------------------------------
// SkillRegistry — executeAll
// ---------------------------------------------------------------------------

describe('SkillRegistry — executeAll', () => {
  it('returns results for all enabled skills', async () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('x', true, { success: true, output: 'x-done' }));
    reg.register(makeSkill('y', true, { success: true, output: 'y-done' }));
    const results = await reg.executeAll(makeCtx());
    expect(results.size).toBe(2);
    expect(results.get('x')?.output).toBe('x-done');
    expect(results.get('y')?.output).toBe('y-done');
  });

  it('skips disabled skills in executeAll', async () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('active', true));
    reg.register(makeSkill('inactive', false));
    const results = await reg.executeAll(makeCtx());
    expect(results.size).toBe(1);
    expect(results.has('active')).toBe(true);
    expect(results.has('inactive')).toBe(false);
  });

  it('captures errors per skill without blocking others in executeAll', async () => {
    const reg = new SkillRegistry();
    const boom: SkillModule = {
      id: 'boom',
      name: 'Boom',
      description: '',
      version: '1.0.0',
      enabled: true,
      async execute() { throw new Error('oops'); },
    };
    reg.register(boom);
    reg.register(makeSkill('safe', true, { success: true, output: 'fine' }));
    const results = await reg.executeAll(makeCtx());
    expect(results.get('boom')?.success).toBe(false);
    expect(results.get('safe')?.success).toBe(true);
  });

  it('returns empty map when no skills are enabled', async () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('s', false));
    const results = await reg.executeAll(makeCtx());
    expect(results.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SkillRegistry — loadFromConfig / toConfig
// ---------------------------------------------------------------------------

describe('SkillRegistry — loadFromConfig / toConfig', () => {
  it('loadFromConfig applies enabled flags from config', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('a', true));
    reg.register(makeSkill('b', true));
    const cfg: SkillConfig = { skills: { a: false, b: true } };
    reg.loadFromConfig(cfg);
    expect(reg.get('a')?.enabled).toBe(false);
    expect(reg.get('b')?.enabled).toBe(true);
  });

  it('loadFromConfig ignores config entries for unregistered skills', () => {
    const reg = new SkillRegistry();
    const cfg: SkillConfig = { skills: { 'not-registered': true } };
    expect(() => reg.loadFromConfig(cfg)).not.toThrow();
    expect(reg.size).toBe(0);
  });

  it('toConfig produces correct SkillConfig snapshot', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('alpha', true));
    reg.register(makeSkill('beta', false));
    const cfg = reg.toConfig();
    expect(cfg.skills).toEqual({ alpha: true, beta: false });
  });

  it('toConfig round-trips through loadFromConfig', () => {
    const reg1 = new SkillRegistry();
    reg1.register(makeSkill('p', true));
    reg1.register(makeSkill('q', false));
    const cfg = reg1.toConfig();

    const reg2 = new SkillRegistry();
    reg2.register(makeSkill('p', false)); // different default
    reg2.register(makeSkill('q', true));  // different default
    reg2.loadFromConfig(cfg);

    expect(reg2.get('p')?.enabled).toBe(true);
    expect(reg2.get('q')?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConfigLoader — file I/O
// ---------------------------------------------------------------------------

describe('ConfigLoader — file I/O', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `weave-skills-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadSkillConfig returns empty skills when file does not exist', () => {
    const cfg = loadSkillConfig(tmpDir);
    expect(cfg.skills).toEqual({});
  });

  it('saveSkillConfig persists and loadSkillConfig reads it back', () => {
    const cfg: SkillConfig = { skills: { 'auto-fix': true, 'code-review': false } };
    saveSkillConfig(cfg, tmpDir);
    const loaded = loadSkillConfig(tmpDir);
    expect(loaded.skills).toEqual({ 'auto-fix': true, 'code-review': false });
  });

  it('saveSkillConfig preserves non-skills keys in the file', () => {
    // Write a config with extra keys
    const configPath = join(tmpDir, CONFIG_FILENAME);
    writeFileSync(configPath, JSON.stringify({ projectName: 'my-proj', customs: 42 }));
    saveSkillConfig({ skills: { 'test-gen': true } }, tmpDir);

    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(raw.projectName).toBe('my-proj');
    expect(raw.customs).toBe(42);
    expect(raw.skills['test-gen']).toBe(true);
  });

  it('setSkillEnabled creates config and toggles a single skill', () => {
    setSkillEnabled('refactor', true, tmpDir);
    expect(loadSkillConfig(tmpDir).skills['refactor']).toBe(true);
    setSkillEnabled('refactor', false, tmpDir);
    expect(loadSkillConfig(tmpDir).skills['refactor']).toBe(false);
  });

  it('mergeSkillConfig merges partial updates', () => {
    saveSkillConfig({ skills: { a: true, b: false } }, tmpDir);
    const result = mergeSkillConfig({ skills: { b: true, c: false } }, tmpDir);
    expect(result.skills).toEqual({ a: true, b: true, c: false });
  });

  it('configExists returns false when file is absent', () => {
    expect(configExists(tmpDir)).toBe(false);
  });

  it('configExists returns true after saving', () => {
    saveSkillConfig({ skills: {} }, tmpDir);
    expect(configExists(tmpDir)).toBe(true);
  });
});
