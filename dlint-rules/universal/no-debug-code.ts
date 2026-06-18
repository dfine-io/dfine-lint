// Detects debug code that must not ship: debugger statements.
// These patterns indicate development-only code left in the source.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Debug code: debugger statement",
    subChecks: 1,
  },
  check(ctx) {
    ctx.walk((node) => {
      if (node.kind === ts.SyntaxKind.DebuggerStatement) {
        ctx.reportAt(node, "Remove debugger statement", {
          action: "remove-debugger", pattern: "Remove debugger before commit",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger",
          fix: ctx.deleteNode(node),
        });
      }
    });
  },
});
