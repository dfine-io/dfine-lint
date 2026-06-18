// Flags async functions in void-expecting callbacks (useEffect, event handlers).
// Async in void context silently drops the Promise — errors are never caught.
// Verifies via React import resolution and contextual typing from TypeChecker.
import ts from "typescript";
import { defineRule, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

/** Structural: contextual type at argument position expects void return */
function expectsVoidReturn(arg: ts.Expression, checker: ts.TypeChecker): boolean {
  const contextual = checker.getContextualType(arg);
  if (!contextual) return false;
  const sigs = contextual.getCallSignatures();
  const sig0 = sigs[0];
  if (!sig0) return false;
  return (sig0.getReturnType().flags & ts.TypeFlags.Void) !== 0;
}

function isReactUseEffect(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "useEffect") return false;
  const sym = checker.getSymbolAtLocation(node.expression);
  return !!sym && isNodeModulesDeclaration(resolveSymbol(checker, sym));
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No async functions in void-expecting callbacks (useEffect, event handlers)",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) return;

      const firstArg = node.arguments[0];
      if (!firstArg) return;
      if (!ts.isArrowFunction(firstArg) && !ts.isFunctionExpression(firstArg)) return;
      if (!(ts.getCombinedModifierFlags(firstArg) & ts.ModifierFlags.Async)) return;

      // Guard: contextual type must expect void return (structural, no name regex)
      const isUseEffect = isReactUseEffect(node, ctx.checker);
      if (!isUseEffect && !expectsVoidReturn(firstArg, ctx.checker)) return;

      const name = isUseEffect ? "useEffect"
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text
        : ts.isIdentifier(node.expression) ? node.expression.text
        : "callback";

      ctx.reportAt(
        firstArg,
        `Wrap async callback in startTransition inside ${name} -- callback expects void, not Promise`,
        {
          action: "wrap-startTransition",
          pattern: "Wrap the async callback in startTransition - it expects void",
          reference: "https://react.dev/reference/react/useEffect",
        }
      );
    });
  },
});
