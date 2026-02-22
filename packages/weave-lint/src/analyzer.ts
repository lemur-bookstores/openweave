import {
  CodeEntity,
  EntityType,
  EntityUsage,
  Severity,
  OrphanEntity,
  OrphanReport,
  AnalysisOptions,
  FileAnalysisResult,
} from "./types";
import { TypeScriptAnalyzer } from "./typescript-analyzer";
import { PythonAnalyzer } from "./python-analyzer";
import path from "path";

/**
 * OrphanDetector - Core orphan code detection engine
 * Combines TypeScript and Python analyzers to find unused code
 */
export class OrphanDetector {
  private projectRoot: string;
  private options: Required<AnalysisOptions>;
  private allEntities: Map<string, CodeEntity> = new Map();
  private usageMap: Map<string, EntityUsage[]> = new Map();

  constructor(projectRoot: string, options: AnalysisOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      includePrivate: options.includePrivate ?? false,
      includeLowSeverity: options.includeLowSeverity ?? false,
      ignorePatterns: options.ignorePatterns ?? ["node_modules", "dist", ".git", "test", "spec"],
      followImports: options.followImports ?? true,
      maxDepth: options.maxDepth ?? 10,
    };
  }

  /**
   * Run complete analysis on project
   */
  async analyze(): Promise<OrphanReport> {
    this.allEntities.clear();
    this.usageMap.clear();

    // Phase 1: Discover all entities
    const tsResults = TypeScriptAnalyzer.analyzeDirectory(
      this.projectRoot,
      this.options.ignorePatterns
    );
    const pyResults = PythonAnalyzer.analyzeDirectory(this.projectRoot, this.options.ignorePatterns);

    for (const result of [...tsResults, ...pyResults]) {
      for (const entity of result.entities) {
        this.allEntities.set(entity.id, entity);
      }
    }

    // Phase 2: Find all usages
    for (const entity of this.allEntities.values()) {
      const usages: EntityUsage[] = [];

      // Search in TypeScript files
      const tsFiles = this.getFilesByExtension(".ts");
      for (const file of tsFiles) {
        usages.push(...TypeScriptAnalyzer.findUsages(entity.name, file));
      }

      // Search in Python files
      const pyFiles = this.getFilesByExtension(".py");
      for (const file of pyFiles) {
        usages.push(...PythonAnalyzer.findUsages(entity.name, file));
      }

      // Filter out usages in the same file at definition line
      const relevantUsages = usages.filter((u) => {
        // Keep if in different file
        if (u.usedInFile !== entity.file) return true;
        // Keep if different line
        if (u.usedAtLine !== entity.line) return true;
        return false;
      });

      if (relevantUsages.length > 0) {
        this.usageMap.set(entity.id, relevantUsages);
      }
    }

    // Phase 3: Identify orphans
    const orphans = this.identifyOrphans();

    // Phase 4: Generate report
    return this.generateReport(orphans, [...tsResults, ...pyResults]);
  }

  /**
   * Identify which entities have no usages
   */
  private identifyOrphans(): OrphanEntity[] {
    const orphans: OrphanEntity[] = [];

    for (const [entityId, entity] of this.allEntities) {
      // Skip private entities if not included
      if (!this.options.includePrivate && entity.name.startsWith("_")) {
        continue;
      }

      // Skip low severity if not included
      if (!this.options.includeLowSeverity && entity.severity === Severity.LOW) {
        continue;
      }

      const usages = this.usageMap.get(entityId) || [];

      // Entity is orphan if it has no usages and not in __init__ or main
      if (usages.length === 0 && !this.isSpecialEntity(entity)) {
        const recommendation = this.generateRecommendation(entity);
        orphans.push({
          ...entity,
          references: usages,
          recommendation,
        });
      }
    }

    return orphans.sort((a, b) => {
      // Sort by severity (CRITICAL first), then by file
      const severityOrder: Record<Severity, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
      };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return a.file.localeCompare(b.file);
    });
  }

  /**
   * Check if entity is special (main, init, etc.)
   * Exported entities are not considered orphans
   */
  private isSpecialEntity(entity: CodeEntity): boolean {
    const specialNames = [
      "main",
      "__main__",
      "__init__",
      "index",
      "setup",
      "setupTests",
      "beforeAll",
      "afterAll",
      "describe",
      "it",
      "test",
    ];
    if (specialNames.includes(entity.name)) return true;

    // Exported or public entities are not orphans
    if (entity.isExported || entity.isPublic) return true;

    return false;
  }

  /**
   * Generate recommendation for orphan entity
   */
  private generateRecommendation(entity: CodeEntity): string {
    if (entity.severity === Severity.CRITICAL) {
      return "⚠️ PUBLIC API: Document usage or remove if deprecated";
    }
    if (entity.severity === Severity.HIGH) {
      return "Consider removing or marking as deprecated";
    }
    if (entity.isPublic) {
      return "Internal export with no usage - consider making private or removing";
    }
    return "Local entity with no usage - safe to remove";
  }

  /**
   * Get all files with specific extension
   */
  private getFilesByExtension(_ext: string): string[] {
    // This would typically use actual file system enumeration
    // For now, we return empty as it will be called by analyzers
    return [];
  }

  /**
   * Generate final orphan report
   */
  private generateReport(orphans: OrphanEntity[], allResults: FileAnalysisResult[]): OrphanReport {
    const orphansBySeverity = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const orphansByType: Record<string, number> = {};

    for (const orphan of orphans) {
      orphansBySeverity[orphan.severity]++;
      orphansByType[orphan.type] = (orphansByType[orphan.type] || 0) + 1;
    }

    const suggestions = this.generateSuggestions(orphans);

    return {
      projectName: path.basename(this.projectRoot),
      analysisDate: new Date(),
      filesAnalyzed: allResults.length,
      totalEntities: this.allEntities.size,
      totalOrphans: orphans.length,
      orphansBySeverity,
      orphansByType: orphansByType as Record<EntityType, number>,
      orphanList: orphans,
      suggestions,
    };
  }

  /**
   * Generate actionable suggestions for the project
   */
  private generateSuggestions(orphans: OrphanEntity[]): string[] {
    const suggestions: string[] = [];

    const criticalOrphans = orphans.filter((o) => o.severity === Severity.CRITICAL);
    if (criticalOrphans.length > 0) {
      suggestions.push(
        `🔴 ${criticalOrphans.length} public entities unused - check if deprecated API should be documented`
      );
    }

    const highOrphans = orphans.filter((o) => o.severity === Severity.HIGH);
    if (highOrphans.length > 0) {
      suggestions.push(`🟠 ${highOrphans.length} module exports unused - consider removal`);
    }

    const mediumOrphans = orphans.filter((o) => o.severity === Severity.MEDIUM);
    if (mediumOrphans.length > 0) {
      suggestions.push(`🟡 ${mediumOrphans.length} internal exports unused - refactor or remove`);
    }

    // Suggestion by entity type
    const orphansByType = new Map<EntityType, number>();
    for (const orphan of orphans) {
      orphansByType.set(orphan.type, (orphansByType.get(orphan.type) || 0) + 1);
    }

    for (const [type, count] of orphansByType) {
      if (count >= 3) {
        suggestions.push(`Consider consolidating ${count} unused ${type}s`);
      }
    }

    if (orphans.length === 0) {
      suggestions.push("✅ No orphan code detected!");
    }

    return suggestions;
  }
}
