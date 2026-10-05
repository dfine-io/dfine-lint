// Detects circular imports via Tarjan's SCC algorithm on the program-wide import graph.
// Circular dependencies cause initialization order bugs and undefined imports at runtime.
// Exempts type-only imports (erased at compile time) and import() calls (they run after initialization).
import ts from "typescript";
import { collectValueImports, defineRule, isProjectSourceFile, resolveImportedModule } from "@dfine-io-gmbh/dlint";

const sccCacheMap = new WeakMap<
  ts.Program,
  Map<string, number>
>();

// Static value imports and re-exports: an import() call cannot take part in an initialization cycle
function staticValueImports(program: ts.Program, sf: ts.SourceFile): ts.StringLiteral[] {
  return collectValueImports(program, sf).filter((literal) => !ts.isCallExpression(literal.parent));
}

function buildImportGraph(program: ts.Program): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const sf of program.getSourceFiles()) {
    if (!isProjectSourceFile(sf)) continue;
    const deps: string[] = [];
    for (const literal of staticValueImports(program, sf)) {
      const resolved = resolveImportedModule(program, literal);
      if (resolved && !resolved.isExternalLibraryImport) deps.push(resolved.resolvedFileName);
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

      // A file importing itself is self-import's finding
      const isCycle = members.length > 1;

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

    for (const literal of staticValueImports(ctx.program, ctx.sourceFile)) {
      const resolved = resolveImportedModule(ctx.program, literal);
      if (resolved && !resolved.isExternalLibraryImport && sccCache.get(resolved.resolvedFileName) === myScc) {
        ctx.reportAt(literal.parent, `Break circular import: ${literal.text}`, {
          action: "break-cycle",
          pattern: "Extract shared types/functions to a separate module to break the cycle",
        });
      }
    }
  },
});
