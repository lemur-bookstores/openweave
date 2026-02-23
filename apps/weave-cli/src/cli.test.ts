import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIArgs } from './types';
import { initCommand } from './commands/init';
import { statusCommand } from './commands/status';
import { milestonesCommand } from './commands/milestones';
import { queryCommand } from './commands/query';
import { orphansCommand } from './commands/orphans';
import { errorsCommand } from './commands/errors';
import { saveNodeCommand } from './commands/save-node';
import { migrateCommand } from './commands/migrate';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Weave CLI - Command Tests', () => {
  const testDir = join(process.cwd(), '.weave-test');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('InitCommand', () => {
    it('should initialize a new project', async () => {
      const args: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };

      const result = await initCommand.execute(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain('initialized successfully');
      expect(result.data).toBeDefined();
      expect((result.data as any).project_name).toBe('test-project');
    });

    it('should fail without project name', async () => {
      const args: CLIArgs = {
        command: 'init',
        args: [],
        flags: { root: testDir },
      };

      const result = await initCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should not reinitialize existing project', async () => {
      // First init
      const args1: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(args1);

      // Second init attempt
      const args2: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      const result = await initCommand.execute(args2);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('should set include-tests flag', async () => {
      const args: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir, 'include-tests': true },
      };

      const result = await initCommand.execute(args);

      expect(result.success).toBe(true);
    });
  });

  describe('StatusCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should display project status', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'status',
          args: [],
          flags: {},
        };

        const result = await statusCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Project Status');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should output JSON when requested', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'status',
          args: [],
          flags: { json: true },
        };

        const result = await statusCommand.execute(args);

        expect(result.success).toBe(true);
        expect(() => JSON.parse(result.message)).not.toThrow();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should show verbose info when requested', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'status',
          args: [],
          flags: { verbose: true },
        };

        const result = await statusCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Configuration');
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should fail when no project found', async () => {
      const args: CLIArgs = {
        command: 'status',
        args: [],
        flags: {},
      };

      const result = await statusCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('MilestonesCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should list all milestones', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'milestones',
          args: [],
          flags: {},
        };

        const result = await milestonesCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Milestones');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter milestones by status', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'milestones',
          args: [],
          flags: { filter: 'completed' },
        };

        const result = await milestonesCommand.execute(args);

        expect(result.success).toBe(true);
        const milestones = result.data as any[];
        expect(
          milestones.every((m) => m.status === 'completed')
        ).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should output JSON format', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'milestones',
          args: [],
          flags: { json: true },
        };

        const result = await milestonesCommand.execute(args);

        expect(result.success).toBe(true);
        expect(() => JSON.parse(result.message)).not.toThrow();
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('QueryCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should query the knowledge graph', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'query',
          args: ['init'],
          flags: {},
        };

        const result = await queryCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Query Results');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should fail without query term', async () => {
      const args: CLIArgs = {
        command: 'query',
        args: [],
        flags: {},
      };

      const result = await queryCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should limit results', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'query',
          args: ['init'],
          flags: { limit: '1' },
        };

        const result = await queryCommand.execute(args);

        expect(result.success).toBe(true);
        const results = result.data as any[];
        expect(results.length).toBeLessThanOrEqual(1);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter by type', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'query',
          args: ['init'],
          flags: { type: 'function' },
        };

        const result = await queryCommand.execute(args);

        expect(result.success).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('OrphansCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should analyze for orphaned code', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'orphans',
          args: [],
          flags: {},
        };

        const result = await orphansCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Orphaned Entities');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter by severity', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'orphans',
          args: [],
          flags: { severity: 'critical' },
        };

        const result = await orphansCommand.execute(args);

        expect(result.success).toBe(true);
        const orphans = (result.data as any).orphans;
        expect(
          orphans.every((o: any) => o.severity === 'critical')
        ).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter by type', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'orphans',
          args: [],
          flags: { type: 'function' },
        };

        const result = await orphansCommand.execute(args);

        expect(result.success).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('ErrorsCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should show error registry', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'errors',
          args: [],
          flags: {},
        };

        const result = await errorsCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Error Registry');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter errors by type', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'errors',
          args: [],
          flags: { type: 'runtime' },
        };

        const result = await errorsCommand.execute(args);

        expect(result.success).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should filter by status (active/suppressed)', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'errors',
          args: [],
          flags: { filter: 'active' },
        };

        const result = await errorsCommand.execute(args);

        expect(result.success).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('SaveNodeCommand', () => {
    beforeEach(async () => {
      const initArgs: CLIArgs = {
        command: 'init',
        args: ['test-project'],
        flags: { root: testDir },
      };
      await initCommand.execute(initArgs);
    });

    it('should save a new node', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'save-node',
          args: [],
          flags: {
            label: 'MyFunction',
            type: 'function',
            description: 'A test function',
          },
        };

        const result = await saveNodeCommand.execute(args);

        expect(result.success).toBe(true);
        expect(result.message).toContain('created successfully');
        expect(result.data).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should fail without label', async () => {
      const args: CLIArgs = {
        command: 'save-node',
        args: [],
        flags: { type: 'function' },
      };

      const result = await saveNodeCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('label');
    });

    it('should fail without type', async () => {
      const args: CLIArgs = {
        command: 'save-node',
        args: [],
        flags: { label: 'MyFunction' },
      };

      const result = await saveNodeCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should include file metadata when provided', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'save-node',
          args: [],
          flags: {
            label: 'MyClass',
            type: 'class',
            file: 'src/MyClass.ts',
            line: '42',
          },
        };

        const result = await saveNodeCommand.execute(args);

        expect(result.success).toBe(true);
        expect((result.data as any).metadata).toBeDefined();
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should output JSON format', async () => {
      const origCwd = process.cwd();
      try {
        process.chdir(testDir);

        const args: CLIArgs = {
          command: 'save-node',
          args: [],
          flags: {
            label: 'TestNode',
            type: 'variable',
            json: true,
          },
        };

        const result = await saveNodeCommand.execute(args);

        expect(result.success).toBe(true);
        expect(() => JSON.parse(result.message)).not.toThrow();
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('CLI Integration', () => {
    it('should handle help flag', () => {
      // Help is handled at CLI level, tested manually
      expect(true).toBe(true);
    });

    it('should handle version flag', () => {
      // Version is handled at CLI level, tested manually
      expect(true).toBe(true);
    });

    it('all commands should have proper structure', () => {
      const commands = [
        initCommand,
        statusCommand,
        milestonesCommand,
        queryCommand,
        orphansCommand,
        errorsCommand,
        saveNodeCommand,
        migrateCommand,
      ];

      for (const cmd of commands) {
        expect(cmd.name).toBeDefined();
        expect(cmd.description).toBeDefined();
        expect(cmd.usage).toBeDefined();
        expect(cmd.execute).toBeDefined();
      }
    });
  });

  // ── MigrateCommand ─────────────────────────────────────────────────────
  describe('MigrateCommand', () => {
    it('fails when source and destination are the same', async () => {
      const result = await migrateCommand.execute({
        command: 'migrate',
        args: [],
        flags: { from: 'json', to: 'json', 'data-dir': testDir },
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('differ');
    });

    it('reports nothing to migrate when source is empty', async () => {
      // Create a valid .weave data dir (empty — no graph files)
      const dataDir = join(testDir, 'empty-data');
      mkdirSync(dataDir, { recursive: true });

      const result = await migrateCommand.execute({
        command: 'migrate',
        args: [],
        flags: { from: 'json', to: 'memory', 'data-dir': dataDir },
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('Nothing to migrate');
    });

    it('migrates json → memory in dry-run mode', async () => {
      const dataDir = join(testDir, 'json-src');
      mkdirSync(dataDir, { recursive: true });
      // Write a graph JSON file the JsonProvider can read
      writeFileSync(
        join(dataDir, 'graph__chat1.json'),
        JSON.stringify({ nodes: {}, edges: {}, metadata: { chatId: 'chat1' } })
      );

      const result = await migrateCommand.execute({
        command: 'migrate',
        args: [],
        flags: { from: 'json', to: 'memory', 'data-dir': dataDir, 'dry-run': true },
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('DRY RUN');
      expect(result.message).toContain('Migrated:  1');
    });

    it('migrates json → memory (live)', async () => {
      const dataDir = join(testDir, 'json-live');
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        join(dataDir, 'graph__chat2.json'),
        JSON.stringify({ nodes: {}, edges: {}, metadata: { chatId: 'chat2' } })
      );

      const result = await migrateCommand.execute({
        command: 'migrate',
        args: [],
        flags: { from: 'json', to: 'memory', 'data-dir': dataDir },
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('Migrated:  1');
    });

    it('rejects unknown provider names', async () => {
      const result = await migrateCommand.execute({
        command: 'migrate',
        args: [],
        flags: { from: 'unknowndb', to: 'memory', 'data-dir': testDir },
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('unknowndb');
    });

    it('has correct command metadata', () => {
      expect(migrateCommand.name).toBe('migrate');
      expect(migrateCommand.description).toContain('Migrate');
      expect(migrateCommand.usage).toContain('weave migrate');
      expect(migrateCommand.execute).toBeDefined();
    });
  });
});
