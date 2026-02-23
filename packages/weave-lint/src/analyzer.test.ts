import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TypeScriptAnalyzer } from "../src/typescript-analyzer";
import { PythonAnalyzer } from "../src/python-analyzer";
import { OrphanDetector } from "../src/analyzer";
import { EntityType } from "../src/types";
import fs from "fs";
import os from "os";
import path from "path";

describe("TypeScriptAnalyzer", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-lint-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it("should extract function declarations", () => {
    const filePath = path.join(testDir, "test.ts");
    const content = `
      export function exportedFunc() {}
      function privateFunc() {}
      async function asyncFunc() {}
    `;
    fs.writeFileSync(filePath, content);

    const result = TypeScriptAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(3);
    expect(result.entities.some((e) => e.name === "exportedFunc")).toBe(true);
    expect(result.entities[0].type).toBe(EntityType.FUNCTION);
  });

  it("should extract class declarations", () => {
    const filePath = path.join(testDir, "test.ts");
    const content = `
      export class MyClass {}
      class PrivateClass {}
      abstract class AbstractClass {}
    `;
    fs.writeFileSync(filePath, content);

    const result = TypeScriptAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(3);
    expect(result.entities.every((e) => e.type === EntityType.CLASS)).toBe(true);
  });

  it("should extract interface declarations", () => {
    const filePath = path.join(testDir, "test.ts");
    const content = `
      export interface MyInterface {}
      interface PrivateInterface {}
    `;
    fs.writeFileSync(filePath, content);

    const result = TypeScriptAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(2);
    expect(result.entities.every((e) => e.type === EntityType.INTERFACE)).toBe(true);
  });

  it("should extract type aliases", () => {
    const filePath = path.join(testDir, "test.ts");
    const content = `
      export type MyType = string;
      type PrivateType = number;
    `;
    fs.writeFileSync(filePath, content);

    const result = TypeScriptAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(2);
    expect(result.entities.every((e) => e.type === EntityType.TYPE)).toBe(true);
  });

  it("should find function usage", () => {
    const filePath = path.join(testDir, "test.ts");
    const content = `
      function helperFunc() {}
      function caller() {
        helperFunc();
        helperFunc();
      }
    `;
    fs.writeFileSync(filePath, content);

    const usages = TypeScriptAnalyzer.findUsages("helperFunc", filePath);
    expect(usages.length).toBeGreaterThan(0);
  });

  it("should handle missing files gracefully", () => {
    const result = TypeScriptAnalyzer.analyzeFile("/nonexistent/file.ts");
    expect(result.errors).toHaveLength(1);
    expect(result.entities).toHaveLength(0);
  });

  it("should analyze directory recursively", () => {
    // Create nested files
    const subdir = path.join(testDir, "src");
    fs.mkdirSync(subdir);

    fs.writeFileSync(path.join(testDir, "test.ts"), "export function funcA() {}");
    fs.writeFileSync(path.join(subdir, "module.ts"), "export class ClassB {}");

    const results = TypeScriptAnalyzer.analyzeDirectory(testDir);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should respect ignore patterns", () => {
    const subdir = path.join(testDir, "node_modules");
    fs.mkdirSync(subdir);

    fs.writeFileSync(path.join(testDir, "test.ts"), "export function funcA() {}");
    fs.writeFileSync(path.join(subdir, "lib.ts"), "export function funcB() {}");

    const results = TypeScriptAnalyzer.analyzeDirectory(testDir, ["node_modules"]);
    expect(results.every((r) => !r.file.includes("node_modules"))).toBe(true);
  });
});

describe("PythonAnalyzer", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-lint-py-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it("should extract function definitions", () => {
    const filePath = path.join(testDir, "test.py");
    const content = `
def public_func():
    pass

def _private_func():
    pass

async def async_func():
    pass
`;
    fs.writeFileSync(filePath, content);

    const result = PythonAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(3);
    expect(result.entities.some((e) => e.name === "public_func")).toBe(true);
  });

  it("should extract class definitions", () => {
    const filePath = path.join(testDir, "test.py");
    const content = `
class MyClass:
    pass

class _PrivateClass:
    pass
`;
    fs.writeFileSync(filePath, content);

    const result = PythonAnalyzer.analyzeFile(filePath);
    expect(result.entities).toHaveLength(2);
    expect(result.entities.every((e) => e.type === EntityType.CLASS)).toBe(true);
  });

  it("should extract module constants", () => {
    const filePath = path.join(testDir, "test.py");
    const content = `
MAX_SIZE = 100
MIN_VALUE = 0
_internal_var = 42
`;
    fs.writeFileSync(filePath, content);

    const result = PythonAnalyzer.analyzeFile(filePath);
    const constants = result.entities.filter((e) => e.type === EntityType.VARIABLE);
    expect(constants.length).toBeGreaterThan(0);
  });

  it("should find function usage in Python", () => {
    const filePath = path.join(testDir, "test.py");
    const content = `
def helper_func():
    pass

def caller():
    helper_func()
    helper_func()
`;
    fs.writeFileSync(filePath, content);

    const usages = PythonAnalyzer.findUsages("helper_func", filePath);
    expect(usages.length).toBeGreaterThan(0);
  });

  it("should analyze Python directory", () => {
    fs.writeFileSync(path.join(testDir, "main.py"), "def main(): pass");
    fs.writeFileSync(path.join(testDir, "utils.py"), "def helper(): pass");

    const results = PythonAnalyzer.analyzeDirectory(testDir);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

describe("OrphanDetector", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-lint-orphan-"));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it("should initialize with options", () => {
    const detector = new OrphanDetector(testDir, {
      includePrivate: true,
      maxDepth: 5,
    });
    expect(detector).toBeDefined();
  });

  it("should detect orphan functions", async () => {
    // Create test files
    fs.writeFileSync(
      path.join(testDir, "main.ts"),
      `
      export function usedFunc() {}
      export function orphanFunc() {}
      
      usedFunc();
    `
    );

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report.projectName).toBeDefined();
    expect(report.analysisDate).toBeInstanceOf(Date);
    expect(report.totalEntities).toBeGreaterThan(0);
  });

  it("should categorize orphans by severity", async () => {
    fs.writeFileSync(
      path.join(testDir, "lib.ts"),
      `
      export function exportedOrphan() {}
      function internalOrphan() {}
    `
    );

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report.orphansBySeverity).toBeDefined();
  });

  it("should respect includePrivate option", async () => {
    fs.writeFileSync(
      path.join(testDir, "file.ts"),
      `
      function _privateFunc() {}
      export function publicFunc() {}
    `
    );

    const detector1 = new OrphanDetector(testDir, { includePrivate: false });
    const report1 = await detector1.analyze();

    const detector2 = new OrphanDetector(testDir, { includePrivate: true });
    const report2 = await detector2.analyze();

    expect(report2.totalOrphans).toBeGreaterThanOrEqual(report1.totalOrphans);
  });

  it("should provide suggestions", async () => {
    fs.writeFileSync(path.join(testDir, "test.ts"), "export function a() {} export function b() {}");

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report.suggestions).toBeInstanceOf(Array);
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it("should track files analyzed", async () => {
    fs.writeFileSync(path.join(testDir, "file1.ts"), "export function f1() {}");
    fs.writeFileSync(path.join(testDir, "file2.ts"), "export function f2() {}");

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report.filesAnalyzed).toBeGreaterThan(0);
  });

  it("should handle mixed TS and Python projects", async () => {
    fs.writeFileSync(path.join(testDir, "main.ts"), "export function tsFunc() {}");
    fs.writeFileSync(path.join(testDir, "utils.py"), "def py_func(): pass");

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report.totalEntities).toBeGreaterThan(0);
    expect(report.filesAnalyzed).toBeGreaterThan(0);
  });

  it("should not mark exported functions as orphans", async () => {
    fs.writeFileSync(
      path.join(testDir, "module.ts"),
      `
      export function apiFunc() {}
      export { apiFunc };
    `
    );

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    const orphanNames = report.orphanList.map((o) => o.name);
    expect(orphanNames.includes("apiFunc")).toBe(false);
  });

  it("should generate report structure correctly", async () => {
    fs.writeFileSync(path.join(testDir, "code.ts"), "export function unused() {}");

    const detector = new OrphanDetector(testDir);
    const report = await detector.analyze();

    expect(report).toHaveProperty("projectName");
    expect(report).toHaveProperty("analysisDate");
    expect(report).toHaveProperty("filesAnalyzed");
    expect(report).toHaveProperty("totalEntities");
    expect(report).toHaveProperty("totalOrphans");
    expect(report).toHaveProperty("orphansBySeverity");
    expect(report).toHaveProperty("orphansByType");
    expect(report).toHaveProperty("orphanList");
    expect(report).toHaveProperty("suggestions");
  });
});
