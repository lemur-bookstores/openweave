/**
 * Installer — M8: Client Integrations
 * Exports all client installers
 */

export type { WeaveLinkConfig, MCPClientEntry, MCPClientsConfig } from './config-generator';
export { ConfigGenerator } from './config-generator';

export type { InstallResult } from './claude-desktop';
export { ClaudeDesktopInstaller } from './claude-desktop';

export type { CursorInstallResult, CursorScope } from './cursor';
export { CursorInstaller } from './cursor';
