import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ExtractorDefinition, ExtractResult, CliOptions, DlintConfig } from "../types.js";
import { createProgram } from "./program.js";
import { setMaxFileSize, scanFiles, scanChangedFiles, scanCommitFiles, scanBranchFiles, loadIgnorePatterns, collectFilesFromDir } from "./scanner.js";

export function extract(
  opts: CliOptions,
  extractors: readonly ExtractorDefinition[],
  config: DlintConfig
): ExtractResult {
  const start = performance.now();
  if (config.maxFileSize) setMaxFileSize(config.maxFileSize);

  const extensions = (config.include ?? ["**/*.ts", "**/*.tsx"])
    .map((p) => `.${p.split(".").pop() ?? "ts"}`)
    .filter((e) => e.length > 1);
  const ig = loadIgnorePatterns(opts.path);
  if (config.exclude) for (const d of config.exclude) ig.add(d);
  function isExcluded(f: string): boolean { return ig.ignores(f); }

  let files: string[];
  if (opts.files.length > 0) {
    const expanded: string[] = [];
    for (const f of opts.files) {
      const absPath = join(opts.path, f);
      if (!existsSync(absPath)) continue;
      if (statSync(absPath).isDirectory()) {
        expanded.push(...collectFilesFromDir(absPath, extensions, opts.path, ig));
      } else {
        expanded.push(f);
      }
    }
    files = expanded.filter((f) => !isExcluded(f));
  } else if (opts.commit) {
    files = scanCommitFiles(opts.path, extensions).filter((f) => !isExcluded(f));
  } else if (opts.branch) {
    files = scanBranchFiles(opts.path, extensions, config.baseBranch).filter((f) => !isExcluded(f));
  } else if (opts.changed) {
    files = scanChangedFiles(opts.path, extensions).filter((f) => !isExcluded(f));
  } else {
    files = scanFiles(opts.path, extensions, config.exclude);
  }

  const { program } = createProgram(opts.path, config.tsconfig);
  const checker = program.getTypeChecker();
  const results: Record<string, { items: unknown[]; count: number }> = {};

  for (const extractor of extractors) {
    const items: unknown[] = [];
    for (const filePath of files) {
      const absPath = join(opts.path, filePath);
      const sourceFile = program.getSourceFile(absPath);
      if (!sourceFile) continue;
      const ctx = { program, checker, sourceFile, tags: config.tags ?? [], directive: config.directive ?? "" };
      items.push(...extractor.extract(ctx));
    }
    results[extractor.id] = { items, count: items.length };
  }

  return {
    extractors: results,
    fileCount: files.length,
    durationMs: Math.round(performance.now() - start),
  };
}
