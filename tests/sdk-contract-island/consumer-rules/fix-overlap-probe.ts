// A test-only consumer rule whose fixes overlap on purpose: pair(x, y) rewrites both arguments in one fix,
// inner(z) unwraps itself. In pair(1, inner(2)) the fixer must apply the inner fix and skip the pair fix whole.
// wrap(z) pins ctx.insertBefore and ctx.insertAfter, which no bundled rule calls.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Test probe whose fixes overlap, to pin that a fix lands whole or not at all",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      const [first, second] = node.arguments;
      if (node.expression.text === "inner" && first) {
        ctx.reportAt(node, "inner", { action: "unwrap", pattern: "inner(z) to z", fix: ctx.createFix(node, first.getText(ctx.sourceFile)) });
      }
      if (node.expression.text === "wrap" && first) {
        ctx.reportAt(node, "wrap", { action: "parenthesize", pattern: "wrap(z) to wrap((z))", fix: [ctx.insertBefore(first, "("), ctx.insertAfter(first, ")")] });
      }
      if (node.expression.text === "pair" && first && second) {
        ctx.reportAt(node, "pair", { action: "bump", pattern: "pair(x, y) to pair(10, 20)", fix: [ctx.createFix(first, "10"), ctx.createFix(second, "20")] });
      }
    });
  },
});
