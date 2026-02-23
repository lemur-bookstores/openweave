/**
 * Script Adapter
 *
 * Executes a local script (bash/python/Node) and reads JSON from stdout.
 * The script receives tool arguments as a JSON string on stdin or via the
 * WEAVE_TOOL_ARGS environment variable.
 *
 * Injectable spawn function for test isolation.
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import type { ToolManifest, ToolCallResult, ToolHandler } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ReturnType<typeof spawn>;

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

export function runScript(
  scriptPath: string,
  actionName: string,
  args: Record<string, unknown>,
  env: Record<string, string>,
  timeoutMs: number,
  spawnFn: SpawnFn = spawn,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawnFn(scriptPath, [actionName], {
      env: {
        ...process.env,
        WEAVE_TOOL_ACTION: actionName,
        WEAVE_TOOL_ARGS: JSON.stringify(args),
        ...env,
      },
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code ?? 0),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, exitCode: -2 });
    });
  });
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createScriptHandler(
  manifest: ToolManifest,
  actionName: string,
  spawnFn?: SpawnFn,
): ToolHandler {
  const scriptPath = manifest.scriptPath!;
  const timeoutMs = manifest.timeout_ms ?? 10_000;
  const scriptEnv = manifest.scriptEnv ?? {};

  return async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const start = Date.now();
    const prefixedName = `${manifest.id}__${actionName}`;

    const { stdout, stderr, exitCode } = await runScript(
      scriptPath,
      actionName,
      args,
      scriptEnv,
      timeoutMs,
      spawnFn,
    );

    if (exitCode === -1) {
      return {
        toolId: manifest.id,
        action: prefixedName,
        success: false,
        error: `Script timeout after ${timeoutMs}ms`,
        durationMs: Date.now() - start,
      };
    }

    if (exitCode !== 0) {
      return {
        toolId: manifest.id,
        action: prefixedName,
        success: false,
        error: stderr.trim() || `Script exited with code ${exitCode}`,
        durationMs: Date.now() - start,
      };
    }

    // Parse JSON from stdout
    const trimmed = stdout.trim();
    let data: unknown = trimmed;
    try {
      data = JSON.parse(trimmed);
    } catch {
      // Return raw string if not valid JSON
    }

    return {
      toolId: manifest.id,
      action: prefixedName,
      success: true,
      data,
      durationMs: Date.now() - start,
    };
  };
}

export function createScriptAdapter(
  manifest: ToolManifest,
  spawnFn?: SpawnFn,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  for (const action of manifest.tools) {
    const prefixedName = `${manifest.id}__${action.name}`;
    handlers.set(prefixedName, createScriptHandler(manifest, action.name, spawnFn));
  }
  return handlers;
}
