// Ensures React.cache() wrapped functions have at least 2 callers.
// Single-caller cache provides no deduplication benefit — adds complexity without value.
import ts from "typescript";
import { defineRule, isProjectSourceFile, resolveCallee } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_CALLERS = 2;
// ===========================================================================

const callerCountsCache = new WeakMap<
  import("typescript").Program,
  Map<string, number>
>();

// Key of a symbol's original declaration; callers pass alias-resolved symbols
function symbolKey(sym: ts.Symbol, fallbackName: string): string {
  const decl = sym.declarations?.[0];
  return decl
    ? `${decl.getSourceFile().fileName}:${decl.getStart()}`
    : fallbackName;
}

function buildCallerCounts(
  program: ts.Program,
  checker: ts.TypeChecker
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sf of program.getSourceFiles()) {
    if (!isProjectSourceFile(sf)) continue;
    function visit(node: ts.Node): void {
      // A call through a namespace import (q.getUser()) counts like a direct one
      const callee = ts.isCallExpression(node) ? resolveCallee(node, checker) : undefined;
      if (callee) {
        const key = symbolKey(callee.symbol, callee.name);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  return counts;
}

export default defineRule({
  meta: {
    category: "performance",
    description: "React.cache caller count >= 2",
  },
  check(ctx) {
    const minCallers = (ctx.options.minCallers as number) ?? MIN_CALLERS;

    let callerCounts = callerCountsCache.get(ctx.program);
    if (!callerCounts) {
      callerCounts = buildCallerCounts(ctx.program, ctx.checker);
      callerCountsCache.set(ctx.program, callerCounts);
    }

    ctx.walk((node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer || !ts.isCallExpression(node.initializer)) return;
      const wrapper = resolveCallee(node.initializer, ctx.checker);
      if (wrapper?.packageName === "react" && wrapper.name === "cache") {
        const fnName = node.name.text;
        const sym = ctx.checker.getSymbolAtLocation(node.name);
        if (!sym) return;
        const key = symbolKey(sym, fnName);
        const count = callerCounts.get(key) ?? 0;
        if (count < minCallers) {
          ctx.reportAt(
            node.name,
            `Remove cache() from ${fnName} -- only ${count} caller(s), need >=${minCallers} for dedup`,
            {
              action: "remove-cache",
              pattern: "Remove cache() wrapper - single-caller functions get no deduplication benefit",
            }
          );
        }
      }
    });
  },
});
