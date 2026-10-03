// Prevents two Neon Serverless antipatterns:
// 1. db.transaction() — Neon HTTP driver does not support transactions.
// 2. await db.* inside loops — N+1 query pattern, use inArray() batch instead.
// Both cause silent failures or severe performance degradation at scale.
import ts from "typescript";
import { defineRule, isInsideLoop, isDbCall, dbRootMethod } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

// N+1 covers only the ops inArray() can batch (WHERE-clause reads/mutations). insert (a deliberate
// multi-row batch, not per-row), execute (raw SQL) and transaction are not inArray-batchable → not flagged.
const N1_BATCHABLE_METHODS: readonly string[] = ["select", "update", "delete"];

export default defineRule({
  meta: {
    category: "performance",
    description: "No db.transaction() (unsupported on Neon Serverless HTTP) and no per-row DB query in a loop (N+1)",
  },
  check(ctx) {
    const drizzleMethods = (ctx.options.drizzleMethods as readonly string[]) ?? DRIZZLE_METHODS;
    const n1Methods = (ctx.options.n1BatchableMethods as readonly string[]) ?? N1_BATCHABLE_METHODS;
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

      // N+1: await db.<select|update|delete>() inside a loop — the ops inArray() can batch.
      if (
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        isInsideLoop(node)
      ) {
        const method = dbRootMethod(node.expression, ctx.checker, drizzleMethods);
        if (method !== null && n1Methods.includes(method)) {
          ctx.reportAt(node, "Replace await db in loop with inArray() batch -- N+1 query", {
            action: "batch-query",
            pattern:
              "const items = await db.select().from(table).where(inArray(table.id, ids))",
          });
        }
      }
    });
  },
});
