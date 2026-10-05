// Flags async functions in void-expecting callbacks (useEffect, event handlers).
// Async in void context silently drops the Promise — errors are never caught.
// Verifies via React import resolution and contextual typing from TypeChecker.
import ts from "typescript";
import { defineRule, resolveCallee } from "@dfine-io-gmbh/dlint";

/** Structural: contextual type at argument position expects void return */
function expectsVoidReturn(arg: ts.Expression, checker: ts.TypeChecker): boolean {
  const contextual = checker.getContextualType(arg);
  if (!contextual) return false;
  const sigs = contextual.getCallSignatures();
  const sig0 = sigs[0];
  if (!sig0) return false;
  return (sig0.getReturnType().flags & ts.TypeFlags.Void) !== 0;
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
      const callee = resolveCallee(node, ctx.checker);
      const isUseEffect = callee?.packageName === "react" && callee.name === "useEffect";
      if (!isUseEffect && !expectsVoidReturn(firstArg, ctx.checker)) return;

      const name = callee?.name ?? "callback";

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
