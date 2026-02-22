import { CodeEntity, EntityType, EntityUsage, Severity, FileAnalysisResult } from "./types";
import fs from "fs";
import path from "path";

/**
 * TypeScriptAnalyzer - Analyzes TypeScript/JavaScript files for code entities
 * Uses simple regex-based parsing (can be extended with proper AST parsing)
 */
export class TypeScriptAnalyzer {
  /**
   * Analyze a TypeScript/JavaScript file
   * Returns entities (declarations) found in the file
   */
  static analyzeFile(filePath: string): FileAnalysisResult {
    const errors: string[] = [];
    const entities: CodeEntity[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Find exported functions
      const functionMatches = [...content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)];
      for (const match of functionMatches) {
        const name = match[1];
        // Check if "export" appears in the match string itself or nearby
        const matchText = match[0];
        const isExported = matchText.startsWith("export") || 
                          content.substring(0, match.index!).includes(`export { ${name}}`);
        const lineNumber = content.substring(0, match.index!).split("\n").length;

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.FUNCTION,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.substring(0, match.index!).lastIndexOf("\n"),
          isExported,
          isPublic: isExported,
          severity: isExported ? Severity.HIGH : Severity.MEDIUM,
        });
      }

      // Find exported classes
      const classMatches = [...content.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g)];
      for (const match of classMatches) {
        const name = match[1];
        const isExported = content.substring(0, match.index!).lastIndexOf("export") >
          content.substring(0, match.index!).lastIndexOf("\n");
        const lineNumber = content.substring(0, match.index!).split("\n").length;

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.CLASS,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.substring(0, match.index!).lastIndexOf("\n"),
          isExported,
          isPublic: isExported,
          severity: isExported ? Severity.HIGH : Severity.MEDIUM,
        });
      }

      // Find exported const/let/var declarations
      const varMatches = [...content.matchAll(/(?:export\s+)?(?:const|let|var)\s+(\w+)/g)];
      for (const match of varMatches) {
        const name = match[1];
        const isExported = content.substring(0, match.index!).lastIndexOf("export") >
          content.substring(0, match.index!).lastIndexOf("\n");
        const lineNumber = content.substring(0, match.index!).split("\n").length;

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.VARIABLE,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.substring(0, match.index!).lastIndexOf("\n"),
          isExported,
          isPublic: isExported,
          severity: isExported ? Severity.MEDIUM : Severity.LOW,
        });
      }

      // Find interface declarations
      const interfaceMatches = [...content.matchAll(/(?:export\s+)?interface\s+(\w+)/g)];
      for (const match of interfaceMatches) {
        const name = match[1];
        const isExported = content.substring(0, match.index!).lastIndexOf("export") >
          content.substring(0, match.index!).lastIndexOf("\n");
        const lineNumber = content.substring(0, match.index!).split("\n").length;

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.INTERFACE,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.substring(0, match.index!).lastIndexOf("\n"),
          isExported,
          isPublic: isExported,
          severity: isExported ? Severity.HIGH : Severity.MEDIUM,
        });
      }

      // Find type aliases
      const typeMatches = [...content.matchAll(/(?:export\s+)?type\s+(\w+)/g)];
      for (const match of typeMatches) {
        const name = match[1];
        const isExported = content.substring(0, match.index!).lastIndexOf("export") >
          content.substring(0, match.index!).lastIndexOf("\n");
        const lineNumber = content.substring(0, match.index!).split("\n").length;

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.TYPE,
          file: filePath,
          line: lineNumber,
          column: match.index! - content.substring(0, match.index!).lastIndexOf("\n"),
          isExported,
          isPublic: isExported,
          severity: isExported ? Severity.HIGH : Severity.MEDIUM,
        });
      }
    } catch (error) {
      errors.push(`Failed to analyze ${filePath}: ${(error as Error).message}`);
    }

    return { file: filePath, entities, errors };
  }

  /**
   * Find usages of an entity in a file
   */
  static findUsages(entityName: string, filePath: string): EntityUsage[] {
    const usages: EntityUsage[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Find all references to the entity name (word boundaries)
      const regex = new RegExp(`\\b${entityName}\\b`, "g");
      let match;

      while ((match = regex.exec(content)) !== null) {
        // Skip if it's in a definition (declaration)
        const beforeMatch = content.substring(Math.max(0, match.index - 50), match.index);
        if (/(?:function|class|const|let|var|interface|type|=>)\s*$/.test(beforeMatch)) {
          continue;
        }

        const lineNumber = content.substring(0, match.index).split("\n").length;
        const lineStart = content.lastIndexOf("\n", match.index) + 1;
        const lineEnd = content.indexOf("\n", match.index);
        const contextStart = Math.max(lineStart, match.index - 30);
        const contextEnd = Math.min(lineEnd === -1 ? content.length : lineEnd, match.index + 30);
        const context = content.substring(contextStart, contextEnd).trim();

        usages.push({
          entityId: `${filePath}:${entityName}`,
          usedInFile: filePath,
          usedAtLine: lineNumber,
          usedAtColumn: match.index - lineStart,
          context,
        });
      }
    } catch (error) {
      // Silently fail on file read errors
    }

    return usages;
  }

  /**
   * Analyze multiple files in a directory
   */
  static analyzeDirectory(
    dirPath: string,
    ignorePatterns: string[] = ["node_modules", "dist", ".git"]
  ): FileAnalysisResult[] {
    const results: FileAnalysisResult[] = [];
    const files = this.getTypeScriptFiles(dirPath, ignorePatterns);

    for (const file of files) {
      results.push(this.analyzeFile(file));
    }

    return results;
  }

  /**
   * Recursively find all TypeScript/JavaScript files
   */
  private static getTypeScriptFiles(
    dirPath: string,
    ignorePatterns: string[],
    depth: number = 0,
    maxDepth: number = 10
  ): string[] {
    const files: string[] = [];

    if (depth > maxDepth) return files;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Check if should ignore
        if (ignorePatterns.some((pattern) => fullPath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          files.push(...this.getTypeScriptFiles(fullPath, ignorePatterns, depth + 1, maxDepth));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.startsWith(".")) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Silently fail on directory read errors
    }

    return files;
  }
}
