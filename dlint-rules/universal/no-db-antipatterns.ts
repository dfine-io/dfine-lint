// Prevents two Drizzle antipatterns: db.transaction() on the Neon HTTP driver, which has none,
// and await db.* inside a loop (N+1), which one inArray() query replaces.
import ts from "typescript";
import { classOrInterfaceOf, defineRule, isInsideLoop, dbRootMethod, isTypeFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

// N+1 covers only the ops inArray() can batch (WHERE-clause reads/mutations). insert (a deliberate
// multi-row batch, not per-row), execute (raw SQL) and transaction are not inArray-batchable → not flagged.
const N1_BATCHABLE_METHODS: readonly string[] = ["select", "update", "delete"];

// A drizzle database over NeonHttpQueryResultHKT: NeonHttpDatabase, its pre-0.30 alias, or an annotated PgDatabase
function isNeonHttpDatabase(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnionOrIntersection()) return type.types.some((t) => isNeonHttpDatabase(t, checker));
  const isReference = (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0;
  const args = isReference ? checker.getTypeArguments(type as ts.TypeReference) : [];
  if (args.some((a) => a.getSymbol()?.name === "NeonHttpQueryResultHKT" && isTypeFromPackage(a, checker, "drizzle-orm"))) return true;
  const declared = classOrInterfaceOf(type);
  return !!declared && checker.getBaseTypes(declared).some((base) => isNeonHttpDatabase(base, checker));
}

export default defineRule({
  meta: {
    category: "performance",
    description: "No db.transaction() on drizzle-orm's Neon HTTP driver and no per-row DB query in a loop (N+1)",
  },
  check(ctx) {
    const drizzleMethods = (ctx.options.drizzleMethods as readonly string[]) ?? DRIZZLE_METHODS;
    const n1Methods = (ctx.options.n1BatchableMethods as readonly string[]) ?? N1_BATCHABLE_METHODS;
    ctx.walk((node) => {
      // db.transaction() throws on the Neon HTTP driver; node-postgres, neon-serverless and others support it
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "transaction" &&
        isNeonHttpDatabase(ctx.checker.getTypeAtLocation(node.expression.expression), ctx.checker)
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
        const method = dbRootMethod(node.expression, ctx.checker, drizzleMethods, "drizzle-orm");
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
