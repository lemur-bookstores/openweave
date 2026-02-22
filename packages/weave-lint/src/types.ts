/**
 * WeaveLint — Orphan Code Detector
 * Analyzes codebases to identify unused functions, classes, and modules
 */

/**
 * Code entity types that can be analyzed
 */
export enum EntityType {
  FUNCTION = "FUNCTION",
  CLASS = "CLASS",
  METHOD = "METHOD",
  INTERFACE = "INTERFACE",
  ENUM = "ENUM",
  TYPE = "TYPE",
  VARIABLE = "VARIABLE",
  EXPORT = "EXPORT",
  IMPORT = "IMPORT",
}

/**
 * Severity levels for orphan findings
 */
export enum Severity {
  CRITICAL = "CRITICAL", // Public API, widely imported
  HIGH = "HIGH", // Module-level export
  MEDIUM = "MEDIUM", // Internal export
  LOW = "LOW", // Local variable/function
}

/**
 * A code entity that was found in the source
 */
export interface CodeEntity {
  id: string;
  name: string;
  type: EntityType;
  file: string;
  line: number;
  column: number;
  isExported: boolean;
  isPublic: boolean;
  severity: Severity;
  documentation?: string;
}

/**
 * A usage/reference to a code entity
 */
export interface EntityUsage {
  entityId: string;
  usedInFile: string;
  usedAtLine: number;
  usedAtColumn: number;
  context: string; // Code snippet showing usage
}

/**
 * A code entity with no usages (orphaned)
 */
export interface OrphanEntity extends CodeEntity {
  references: EntityUsage[]; // Any references found during analysis
  recommendation: string; // What to do with it
}

/**
 * Report of orphan entities in a codebase
 */
export interface OrphanReport {
  projectName: string;
  analysisDate: Date;
  filesAnalyzed: number;
  totalEntities: number;
  totalOrphans: number;
  orphansBySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  orphansByType: {
    [key in EntityType]?: number;
  };
  orphanList: OrphanEntity[];
  suggestions: string[];
}

/**
 * Analysis options
 */
export interface AnalysisOptions {
  includePrivate?: boolean;
  includeLowSeverity?: boolean;
  ignorePatterns?: string[]; // e.g., test files, node_modules
  followImports?: boolean;
  maxDepth?: number;
}

/**
 * Result of a single file analysis
 */
export interface FileAnalysisResult {
  file: string;
  entities: CodeEntity[];
  errors: string[];
}
