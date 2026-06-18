// Prevents two Neon Serverless antipatterns:
// 1. db.transaction() — Neon HTTP driver does not support transactions.
// 2. await db.* inside loops — N+1 query pattern, use inArray() batch instead.
// Both cause silent failures or severe performance degradation at scale.
import ts from "typescript";
import { defineRule, isInsideLoop, isDbCall } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

export default defineRule({
  meta: {
    category: "performance",
    description: "No db.transaction() — Neon Serverless HTTP does not support transactions",
  },
  check(ctx) {
    const drizzleMethods = (ctx.options.drizzleMethods as readonly string[]) ?? DRIZZLE_METHODS;
    ctx.walk((node) => {
      // db.transaction() is forbidden (Neon HTTP)
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "transaction" &&
        isDbCall(node, ctx.checker, drizzleMethods)
      ) {
        ctx.reportAt(
          node,
          "Remove db.transaction() -- Neon HTTP does not support transactions",
          {
            action: "remove-transaction",
            pattern:
              "Use Promise.all([db.update(...), db.delete(...)]) instead",
          }
        );
      }

      // N+1: await db.* inside loop
      if (
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        isDbCall(node.expression, ctx.checker, drizzleMethods) &&
        isInsideLoop(node)
      ) {
        ctx.reportAt(node, "Replace await db in loop with inArray() batch -- N+1 query", {
          action: "batch-query",
          pattern:
            "const items = await db.select().from(table).where(inArray(table.id, ids))",
        });
      }
    });
  },
});
