// Flags `await` on expressions that are not Promises (no `then` property).
// Catches accidental awaiting of synchronous values which silently wraps them.
// Skips any/unknown types where await may be intentional.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "await on non-Promise value",
  },
  check(ctx) {
    function isThenable(type: ts.Type): boolean {
      const thenProp = type.getProperty("then");
      if (thenProp) {
        const thenType = ctx.checker.getTypeOfSymbol(thenProp);
        return thenType.getCallSignatures().length > 0;
      }
      if (type.isUnion()) return type.types.some((t) => isThenable(t));
      return false;
    }

    ctx.walk((node) => {
      if (!ts.isAwaitExpression(node)) return;
      const type = ctx.checker.getTypeAtLocation(node.expression);
      if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
      if (!isThenable(type)) {
        ctx.reportAt(
          node,
          `Remove await on non-thenable type: ${ctx.checker.typeToString(type)}`,
          {
            action: "remove-await",
            pattern: "Remove the await keyword or wrap in Promise.resolve()",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await",
            fix: ctx.createFix(node, node.expression.getText(ctx.sourceFile)),
          }
        );
      }
    });
  },
});
