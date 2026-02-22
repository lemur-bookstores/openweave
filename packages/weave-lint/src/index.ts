/**
 * WeaveLint - Orphan Code Detector
 * Identifies unused functions, classes, and modules in a codebase
 */

// Re-export all types and analyzers
export * from "./types";
export { TypeScriptAnalyzer } from "./typescript-analyzer";
export { PythonAnalyzer } from "./python-analyzer";
export { OrphanDetector } from "./analyzer";

export const version = "0.1.0";