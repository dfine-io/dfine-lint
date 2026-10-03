import { join } from "node:path";
import type { ExtractorDefinition, ExtractResult, CliOptions, DlintConfig } from "../types.js";
import { createProgram } from "./program.js";
import { collectFiles } from "./scanner.js";

export function extract(
  opts: CliOptions,
  extractors: readonly ExtractorDefinition[],
  config: DlintConfig
): ExtractResult {
  const start = performance.now();
  const files = collectFiles(opts, config);

  const { program } = createProgram(opts.path, config.tsconfig);
  const checker = program.getTypeChecker();
  const sourceFiles = files.flatMap((f) => program.getSourceFile(join(opts.path, f)) ?? []);
  const results: Record<string, { items: unknown[]; count: number }> = {};

  for (const extractor of extractors) {
    const items: unknown[] = [];
    for (const sourceFile of sourceFiles) {
      const ctx = { program, checker, sourceFile, tags: config.tags ?? [], directive: config.directive ?? "" };
      items.push(...extractor.extract(ctx));
    }
    results[extractor.id] = { items, count: items.length };
  }

  return {
    extractors: results,
    fileCount: sourceFiles.length,
    durationMs: Math.round(performance.now() - start),
  };
}
