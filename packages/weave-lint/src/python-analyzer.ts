import { CodeEntity, EntityType, EntityUsage, Severity, FileAnalysisResult } from "./types";
import fs from "fs";
import path from "path";

/**
 * PythonAnalyzer - Analyzes Python files for code entities
 * Uses regex-based parsing (can be extended with Python AST wrapper)
 */
export class PythonAnalyzer {
  /**
   * Analyze a Python file
   * Returns entities (declarations) found in the file
   */
  static analyzeFile(filePath: string): FileAnalysisResult {
    const errors: string[] = [];
    const entities: CodeEntity[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Find function definitions
      const functionMatches = [...content.matchAll(/^(?:async\s+)?def\s+(\w+)\s*\(/gm)];
      for (const match of functionMatches) {
        const name = match[1];
        const lineNumber = content.substring(0, match.index!).split("\n").length;
        const isPrivate = name.startsWith("_");
        const isExported = !isPrivate && this.isPublicExport(name, content);

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.FUNCTION,
          file: filePath,
          line: lineNumber,
          column: match.index! % 1000, // Approximate
          isExported,
          isPublic: isExported,
          severity: this.calculateSeverity(isExported, isPrivate),
        });
      }

      // Find class definitions
      const classMatches = [...content.matchAll(/^class\s+(\w+)(?:\(|:)/gm)];
      for (const match of classMatches) {
        const name = match[1];
        const lineNumber = content.substring(0, match.index!).split("\n").length;
        const isPrivate = name.startsWith("_");
        const isExported = !isPrivate && this.isPublicExport(name, content);

        entities.push({
          id: `${filePath}:${name}:${lineNumber}`,
          name,
          type: EntityType.CLASS,
          file: filePath,
          line: lineNumber,
          column: match.index! % 1000,
          isExported,
          isPublic: isExported,
          severity: this.calculateSeverity(isExported, isPrivate),
        });
      }

      // Find module-level variables (simple: starts at column 0)
      const varMatches = [...content.matchAll(/^(\w+)\s*=/gm)];
      for (const match of varMatches) {
        const name = match[1];
        if (!/^(if|for|while|try|except|else|elif|with)$/.test(name)) {
          const lineNumber = content.substring(0, match.index!).split("\n").length;
          const isPrivate = name.startsWith("_");
          const isExported = !isPrivate && this.isModuleConstant(name);

          entities.push({
            id: `${filePath}:${name}:${lineNumber}`,
            name,
            type: EntityType.VARIABLE,
            file: filePath,
            line: lineNumber,
            column: match.index! % 1000,
            isExported,
            isPublic: isExported,
            severity: this.calculateSeverity(isExported, isPrivate),
          });
        }
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
        if (/(?:def|class|import|from)\s+\w*$/.test(beforeMatch)) {
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
    ignorePatterns: string[] = ["__pycache__", ".git", "venv", ".env"]
  ): FileAnalysisResult[] {
    const results: FileAnalysisResult[] = [];
    const files = this.getPythonFiles(dirPath, ignorePatterns);

    for (const file of files) {
      results.push(this.analyzeFile(file));
    }

    return results;
  }

  /**
   * Check if entity is exported at module level (in __all__ or documented)
   */
  private static isPublicExport(name: string, content: string): boolean {
    // Check if in __all__
    const allMatch = content.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
    if (allMatch && allMatch[1].includes(`"${name}"`) || allMatch?.[1].includes(`'${name}'`)) {
      return true;
    }

    // Check if has docstring after export
    const pattern = new RegExp(`^(${name}|def ${name}|class ${name}).*\\n\\s*"""`, "m");
    return pattern.test(content);
  }

  /**
   * Check if variable looks like a module constant (UPPERCASE)
   */
  private static isModuleConstant(name: string): boolean {
    return /^[A-Z_][A-Z0-9_]*$/.test(name);
  }

  /**
   * Calculate severity based on export status and visibility
   */
  private static calculateSeverity(isExported: boolean, isPrivate: boolean): Severity {
    if (isPrivate) return Severity.LOW;
    if (isExported) return Severity.CRITICAL;
    return Severity.MEDIUM;
  }

  /**
   * Recursively find all Python files
   */
  private static getPythonFiles(
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
          files.push(...this.getPythonFiles(fullPath, ignorePatterns, depth + 1, maxDepth));
        } else if (/\.py$/.test(entry.name) && !entry.name.startsWith(".")) {
          files.push(fullPath);
        }
      }
    } catch (_error) {
      // Silently fail on directory read errors
    }

    return files;
  }
}
