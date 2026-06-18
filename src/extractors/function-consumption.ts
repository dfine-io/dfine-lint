// function-consumption.ts — Extracts call targets, DB tables, and body hash per exported function
// Used by Code Duplication tab for consumption-overlap analysis and dead export detection

import ts from "typescript";
import { defineExtractor } from "../helpers/define-extractor.js";
import type { FunctionConsumption } from "../types.js";

function extractCallTargets(checker: ts.TypeChecker, body: ts.Block): { name: string; file: string }[] {
  const targets: { name: string; file: string }[] = [];
  const seen = new Set<string>();
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      const sym = checker.getSymbolAtLocation(expr);
      if (sym) {
        const decl = sym.valueDeclaration ?? sym.declarations?.[0];
        if (decl) {
          const sf = decl.getSourceFile();
          if (!sf.fileName.includes("node_modules")) {
            const key = `${sf.fileName}::${sym.name}`;
            if (!seen.has(key)) { seen.add(key); targets.push({ name: sym.name, file: sf.fileName }); }
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

function getExportedFunctionBody(stmt: ts.Statement, sf: ts.SourceFile): { name: string; body: ts.Block; line: number } | undefined {
  if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
    if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
    return { name: stmt.name.text, body: stmt.body, line: sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1 };
  }
  if (ts.isVariableStatement(stmt) && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = decl.initializer;
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body && ts.isBlock(init.body)) {
        return { name: decl.name.text, body: init.body, line: sf.getLineAndCharacterOfPosition(decl.getStart()).line + 1 };
      }
    }
  }
  return undefined;
}

export default defineExtractor<FunctionConsumption>({
  id: "function-consumption",
  name: "Function Consumption Analysis",
  extract(ctx) {
    const sf = ctx.sourceFile;
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) return [];
    const results: FunctionConsumption[] = [];
    for (const stmt of sf.statements) {
      const fn = getExportedFunctionBody(stmt, sf);
      if (!fn || fn.body.statements.length < 3) continue;
      results.push({
        name: fn.name,
        filePath: sf.fileName,
        line: fn.line,
        callTargets: extractCallTargets(ctx.checker, fn.body),
        dbTables: extractDbTables(ctx.checker, fn.body),
        bodyHash: hashBody(fn.body.getFullText()),
        tokenCount: fn.body.statements.length,
      });
    }
    return results;
  },
});
