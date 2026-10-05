// Flags an Error (or Error-derived) value constructed as a bare statement and discarded -
// almost always a forgotten `throw`. The value is provably unused: its parent is an
// ExpressionStatement, so it is not thrown, returned, assigned, or passed anywhere.
import ts from "typescript";
import { defineRule, extendsLibType } from "@dfine-io-gmbh/dlint";

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
      // The lib's Error or a subclass of it; a local `class Error` with side effects is not one
      if (!extendsLibType(type, ctx.checker, ["Error"])) return;
      ctx.reportAt(node.expression, "Error constructed but never thrown -- did you forget `throw`?", {
        action: "throw-error",
        pattern: "Throw the error - prefix with throw, or remove the dead new Error(...)",
        reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw",
      });
    });
  },
});
