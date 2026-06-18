// Ensures React.cache() wrapped functions have at least 2 callers.
// Single-caller cache provides no deduplication benefit — adds complexity without value.
import ts from "typescript";
import { defineRule, resolveSymbol, isFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_CALLERS = 2;
// ===========================================================================

const callerCountsCache = new WeakMap<
  import("typescript").Program,
  Map<string, number>
>();

/** Build key from resolved symbol's original declaration location */
function symbolKey(
  checker: ts.TypeChecker,
  sym: ts.Symbol,
  fallbackName: string
): string {
  const resolved = resolveSymbol(checker, sym);
  const decl = resolved.declarations?.[0];
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
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const sym = checker.getSymbolAtLocation(node.expression);
        if (sym) {
          const key = symbolKey(checker, sym, node.expression.text);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
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
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "cache" &&
        isFromPackage(node.initializer.expression, ctx.checker, "react") &&
        ts.isIdentifier(node.name)
      ) {
        const fnName = node.name.text;
        const sym = ctx.checker.getSymbolAtLocation(node.name);
        if (!sym) return;
        const key = symbolKey(ctx.checker, sym, fnName);
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
