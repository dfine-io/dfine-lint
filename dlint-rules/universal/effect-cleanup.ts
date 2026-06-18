// Ensures useEffect callbacks clean up side effects properly.
// Checks: addEventListener/removeEventListener, setInterval/clearInterval,
// setTimeout/clearTimeout, observe/disconnect, on/off pairs.
// Missing cleanup causes memory leaks and stale event handlers in React.
import ts from "typescript";
import { defineRule, isLibDeclaration, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const CLEANUP_MAP: Record<string, string> = {
  addEventListener: "removeEventListener",
  setInterval: "clearInterval",
  setTimeout: "clearTimeout",
  observe: "disconnect",
  on: "off",
};
// ===========================================================================

function findCalls(node: ts.Node, names: Set<string>, checker: ts.TypeChecker): Set<string> {
  const found = new Set<string>();
  function visit(n: ts.Node): void {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      names.has(n.expression.name.text)
    ) {
      const methodSym = checker.getSymbolAtLocation(n.expression.name);
      if (methodSym && (isLibDeclaration(methodSym) || isNodeModulesDeclaration(methodSym))) {
        found.add(n.expression.name.text);
      }
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      names.has(n.expression.text)
    ) {
      const funcSym = checker.getSymbolAtLocation(n.expression);
      if (funcSym && isLibDeclaration(funcSym)) {
        found.add(n.expression.text);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

function getCleanupCalls(callback: ts.ArrowFunction | ts.FunctionExpression, cleanupNames: Set<string>, checker: ts.TypeChecker): Set<string> {
  if (!callback.body || !ts.isBlock(callback.body)) return new Set();
  const found = new Set<string>();
  /* Scan all return statements including those inside conditional branches */
  function scanForReturns(node: ts.Node): void {
    if (ts.isReturnStatement(node) && node.expression) {
      for (const name of findCalls(node.expression, cleanupNames, checker)) {
        found.add(name);
      }
    }
    /* Don't descend into nested functions */
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return;
    ts.forEachChild(node, scanForReturns);
  }
  scanForReturns(callback.body);
  return found;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "useEffect cleanup for addEventListener/setInterval",
  },
  check(ctx) {
    const cleanupMap = (ctx.options.cleanupMap as Record<string, string>) ?? CLEANUP_MAP;
    const setupNames = new Set(Object.keys(cleanupMap));
    const cleanupNames = new Set(Object.values(cleanupMap));

    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    ctx.walk((node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useEffect" &&
        node.arguments.length > 0
      ) {
        const ueSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!ueSym || !isNodeModulesDeclaration(resolveSymbol(ctx.checker, ueSym))) return;
        const callback = node.arguments[0];
        if (!callback) return;
        if (
          !ts.isArrowFunction(callback) &&
          !ts.isFunctionExpression(callback)
        )
          return;
        if (!callback.body) return;

        const setupCalls = findCalls(callback.body, setupNames, ctx.checker);
        if (setupCalls.size === 0) return;

        const cleanupCalls = getCleanupCalls(callback, cleanupNames, ctx.checker);

        for (const method of setupCalls) {
          const cleanup = cleanupMap[method];
          if (!cleanup) continue;
          if (!cleanupCalls.has(cleanup)) {
            ctx.reportAt(
              callback,
              `Add ${cleanup}() cleanup to useEffect return for ${method}()`,
              {
                action: "add-cleanup",
                pattern: `Return a cleanup function that calls ${cleanup}()`,
                reference: "https://react.dev/reference/react/useEffect",
              }
            );
          }
        }
      }
    });
  },
});
