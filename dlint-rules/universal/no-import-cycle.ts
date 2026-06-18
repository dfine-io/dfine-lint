// Detects circular imports via Tarjan's SCC algorithm on the program-wide import graph.
// Circular dependencies cause initialization order bugs and undefined imports at runtime.
// Exempts type-only imports which are erased at compile time and cannot cause cycles.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

const sccCacheMap = new WeakMap<
  ts.Program,
  Map<string, number>
>();

function isTypeOnlyImport(stmt: ts.ImportDeclaration): boolean {
  if (stmt.importClause?.isTypeOnly) return true;
  const bindings = stmt.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) {
    return bindings.elements.every(e => e.isTypeOnly);
  }
  return false;
}

function buildImportGraph(program: ts.Program): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const options = program.getCompilerOptions();

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    const deps: string[] = [];

    for (const stmt of sf.statements) {
      let specifier: ts.StringLiteral | undefined;
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (isTypeOnlyImport(stmt)) continue;
        specifier = stmt.moduleSpecifier;
      }
      if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (stmt.isTypeOnly) continue;
        specifier = stmt.moduleSpecifier;
      }
      if (!specifier) continue;
      const resolved = ts.resolveModuleName(specifier.text, sf.fileName, options, ts.sys);
      if (resolved.resolvedModule && !resolved.resolvedModule.isExternalLibraryImport) {
        deps.push(resolved.resolvedModule.resolvedFileName);
      }
    }

    graph.set(sf.fileName, deps);
  }

  return graph;
}

function computeSCCs(graph: Map<string, string[]>): Map<string, number> {
  const indexMap = new Map<string, number>();
  const lowlinkMap = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result = new Map<string, number>();
  let idx = 0;
  let sccId = 0;

  function strongConnect(v: string): void {
    indexMap.set(v, idx);
    lowlinkMap.set(v, idx);
    idx++;
    stack.push(v);
    onStack.add(v);

    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!indexMap.has(w)) {
        strongConnect(w);
        const vLow = lowlinkMap.get(v) ?? 0;
        const wLow = lowlinkMap.get(w) ?? 0;
        lowlinkMap.set(v, Math.min(vLow, wLow));
      } else if (onStack.has(w)) {
        const vLow2 = lowlinkMap.get(v) ?? 0;
        const wIdx = indexMap.get(w) ?? 0;
        lowlinkMap.set(v, Math.min(vLow2, wIdx));
      }
    }

    const vFinalLow = lowlinkMap.get(v);
    const vFinalIdx = indexMap.get(v);
    if (vFinalLow !== undefined && vFinalIdx !== undefined && vFinalLow === vFinalIdx) {
      const members: string[] = [];
      let w: string;
      do {
        const popped = stack.pop();
        if (popped === undefined) break;
        w = popped;
        onStack.delete(w);
        members.push(w);
      } while (w !== v);

      const isCycle =
        members.length > 1 ||
        (members.length === 1 && (graph.get(v) ?? []).includes(v));

      for (const m of members) {
        result.set(m, isCycle ? sccId : -1);
      }
      sccId++;
    }
  }

  for (const v of graph.keys()) {
    if (!indexMap.has(v)) {
      strongConnect(v);
    }
  }

  return result;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Circular import detection via Tarjan SCC",
  },
  check(ctx) {
    let sccCache = sccCacheMap.get(ctx.program);
    if (!sccCache) {
      const graph = buildImportGraph(ctx.program);
      sccCache = computeSCCs(graph);
      sccCacheMap.set(ctx.program, sccCache);
    }

    const fileName = ctx.sourceFile.fileName;
    const myScc = sccCache.get(fileName);
    if (myScc === undefined || myScc === -1) return;

    const options = ctx.program.getCompilerOptions();

    for (const stmt of ctx.sourceFile.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (isTypeOnlyImport(stmt)) continue;
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (stmt.isTypeOnly) continue;
      } else { continue; }
      if (
        stmt.moduleSpecifier &&
        ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        const resolved = ts.resolveModuleName(
          stmt.moduleSpecifier.text,
          fileName,
          options,
          ts.sys
        );
        if (
          resolved.resolvedModule &&
          !resolved.resolvedModule.isExternalLibraryImport &&
          sccCache.get(resolved.resolvedModule.resolvedFileName) === myScc
        ) {
          ctx.reportAt(stmt, `Break circular import: ${stmt.moduleSpecifier.text}`, {
            action: "break-cycle",
            pattern:
              "Extract shared types/functions to a separate module to break the cycle",
          });
        }
      }
    }
  },
});
