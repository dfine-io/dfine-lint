// Flags an Error (or Error-derived) value constructed as a bare statement and discarded -
// almost always a forgotten `throw`. The value is provably unused: its parent is an
// ExpressionStatement, so it is not thrown, returned, assigned, or passed anywhere.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function derivesFromError(type: ts.Type, checker: ts.TypeChecker): boolean {
  const seen = new Set<ts.Type>();
  function walk(t: ts.Type): boolean {
    if (seen.has(t)) return false;
    seen.add(t);
    if (t.symbol?.name === "Error") return true;
    if (t.isClassOrInterface()) {
      for (const base of checker.getBaseTypes(t)) if (walk(base)) return true;
    }
    return false;
  }
  return walk(type);
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No Error constructed but never thrown (likely a missing throw)",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isExpressionStatement(node)) return;
      if (!ts.isNewExpression(node.expression)) return;
      const type = ctx.checker.getTypeAtLocation(node.expression);
      if (!derivesFromError(type, ctx.checker)) return;
      ctx.reportAt(node.expression, "Error constructed but never thrown -- did you forget `throw`?", {
        action: "throw-error",
        pattern: "Throw the error - prefix with throw, or remove the dead new Error(...)",
        reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw",
      });
    });
  },
});
