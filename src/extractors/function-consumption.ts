// function-consumption.ts — Extracts call targets, DB tables, and body hash per exported function
// Used by Code Duplication tab for consumption-overlap analysis and dead export detection

import ts from "typescript";
import { getExportedFunctions } from "../core/program.js";
import { defineExtractor } from "../helpers/define-extractor.js";
import { isProjectSourceFile, packageOfFile, resolveSymbol } from "../helpers/ast.js";
import type { FunctionConsumption } from "../types.js";

function extractCallTargets(checker: ts.TypeChecker, body: ts.Block): { name: string; file: string }[] {
  const targets: { name: string; file: string }[] = [];
  const seen = new Set<string>();
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      // Through the import alias to the declaration: an imported readFile lives in its package, not the caller
      const raw = checker.getSymbolAtLocation(expr);
      const sym = raw && resolveSymbol(checker, raw);
      if (sym) {
        const decl = sym.valueDeclaration ?? sym.declarations?.[0];
        if (decl) {
          const sf = decl.getSourceFile();
          if (packageOfFile(sf.fileName) === undefined) {
            // A default export's symbol is named "default": take the declaration's own name
            const declared = ts.getNameOfDeclaration(decl);
            const name = declared && ts.isIdentifier(declared) ? declared.text : sym.name;
            const key = `${sf.fileName}::${name}`;
            if (!seen.has(key)) { seen.add(key); targets.push({ name, file: sf.fileName }); }
          }
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  ts.forEachChild(body, walk);
  return targets;
}

function extractDbTables(checker: ts.TypeChecker, body: ts.Block): string[] {
  const tables = new Set<string>();
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "from" || method === "insert" || method === "update" || method === "delete") {
        for (const arg of node.arguments) {
          const sym = checker.getSymbolAtLocation(arg);
          if (sym) tables.add(sym.name);
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  ts.forEachChild(body, walk);
  return [...tables];
}

function hashBody(text: string): string {
  const normalized = text
    .replace(/[a-zA-Z_$][a-zA-Z0-9_$]*/g, "$")
    .replace(/"[^"]*"/g, "$S").replace(/'[^']*'/g, "$S")
    .replace(/`[^`]*`/g, "$T")
    .replace(/\b\d+\.?\d*\b/g, "$N")
    .replace(/\s+/g, " ");
  let h = 0;
  for (let i = 0; i < normalized.length; i++) h = ((h << 5) - h + normalized.charCodeAt(i)) | 0;
  return h.toString(36);
}

export default defineExtractor<FunctionConsumption>({
  id: "function-consumption",
  name: "Function Consumption Analysis",
  extract(ctx) {
    const sf = ctx.sourceFile;
    if (!isProjectSourceFile(sf)) return [];
    const results: FunctionConsumption[] = [];
    for (const fn of getExportedFunctions(sf, ctx.checker)) {
      if (!fn.body || !ts.isBlock(fn.body) || fn.body.statements.length < 3) continue;
      results.push({
        name: fn.name.text,
        filePath: sf.fileName,
        line: sf.getLineAndCharacterOfPosition(fn.node.getStart(sf)).line + 1,
        callTargets: extractCallTargets(ctx.checker, fn.body),
        dbTables: extractDbTables(ctx.checker, fn.body),
        bodyHash: hashBody(fn.body.getFullText()),
        tokenCount: fn.body.statements.length,
      });
    }
    return results;
  },
});
