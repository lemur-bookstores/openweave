/**
 * Resolves the effective project root directory.
 *
 * When the CLI is invoked through `pnpm --filter weave-cli dev ...` (or any
 * npm/pnpm script), the package manager changes the working directory to the
 * package folder (e.g. apps/weave-cli/).  However, npm and pnpm both set the
 * INIT_CWD environment variable to the *original* directory from which the
 * command was run, so we prefer that over process.cwd().
 *
 * In a production global install (`weave init`) both values are identical and
 * INIT_CWD simply may not be set — the fallback to process.cwd() is safe.
 *
 * @param explicitRoot - Optional path supplied via the --root flag.  When
 *   present it always wins over any automatic detection.
 */
export function resolveProjectRoot(explicitRoot?: string): string {
  if (explicitRoot) return explicitRoot;
  return process.env['INIT_CWD'] ?? process.cwd();
}
