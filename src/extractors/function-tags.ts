import ts from "typescript";
import { defineExtractor } from "../helpers/define-extractor.js";
import { hasDirective, getExportedFunctions } from "../core/program.js";
import { unwrapPromiseType } from "../helpers/ast.js";
import type { FunctionTag } from "../types.js";

function collectCallNames(body: ts.Node): Set<string> {
  const names = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) names.add(node.expression.text);
      if (ts.isPropertyAccessExpression(node.expression)) names.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return names;
}

function matchTags(callNames: Set<string>, tags: readonly string[]): string[] {
  const matched: string[] = [];
  for (const tag of tags) {
    if (tag.startsWith("^") || tag.endsWith("$")) {
      if (/[+*]{2,}|(\+\+|\*\*)|(\([^)]*\+\)[*+])/.test(tag)) continue;
      try {
        const regex = new RegExp(tag);
        for (const name of callNames) {
          if (regex.test(name)) { matched.push(tag); break; }
        }
      } catch { /* invalid regex — skip */ }
    } else {
      if (callNames.has(tag)) matched.push(tag);
    }
  }
  return matched;
}

export default defineExtractor<FunctionTag>({
  id: "function-tags",
  name: "Function Tag Extractor",
  extract(ctx) {
    if (!ctx.directive || !hasDirective(ctx.sourceFile, ctx.directive)) return [];
    if (ctx.tags.length === 0) return [];
    const allExports = getExportedFunctions(ctx.sourceFile, ctx.checker);
    const allNames = new Set(allExports.map((fn) => fn.name.text));
    const results: FunctionTag[] = [];
    for (const fn of allExports) {
      if (!fn.body || !ts.isBlock(fn.body)) continue;
      const sig = ctx.checker.getSignatureFromDeclaration(fn.node as ts.SignatureDeclaration);
      const returnType = sig
        ? ctx.checker.typeToString(unwrapPromiseType(ctx.checker.getReturnTypeOfSignature(sig), ctx.checker))
        : "unknown";
      const callNames = collectCallNames(fn.body);
      results.push({
        functionName: fn.name.text,
        filePath: ctx.sourceFile.fileName,
        tags: matchTags(callNames, ctx.tags),
        returnType,
        callsExports: [...callNames].filter((n) => allNames.has(n) && n !== fn.name.text),
      });
    }
    return results;
  },
});
