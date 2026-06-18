// Flags db.insert()/db.update() in Server Actions where result is assigned
// but .returning() is missing from the query chain.
// Without .returning(), the assigned variable contains metadata, not the row data.
import ts from "typescript";
import { defineRule, hasDirective, isDbCall } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

function isDbMutation(
  node: ts.Expression,
  checker: ts.TypeChecker,
  dbMethods: readonly string[]
): boolean {
  if (!isDbCall(node, checker, dbMethods)) return false;
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "insert" || node.name.text === "update") return true;
    return isDbMutation(node.expression, checker, dbMethods);
  }
  if (ts.isCallExpression(node)) return isDbMutation(node.expression, checker, dbMethods);
  return false;
}

function hasReturning(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "returning")
    return true;
  if (ts.isCallExpression(node)) return hasReturning(node.expression);
  if (ts.isPropertyAccessExpression(node)) return hasReturning(node.expression);
  return false;
}

export default defineRule({
  meta: {
    category: "performance",
    description: "Missing .returning() on db.insert/update",
  },
  check(ctx) {
    const drizzleMethods = (ctx.options.drizzleMethods as readonly string[]) ?? DRIZZLE_METHODS;
    if (!hasDirective(ctx.sourceFile, "use server")) return;

    ctx.walk((node) => {
      if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
        if (!isDbMutation(node.expression, ctx.checker, drizzleMethods)) return;
        if (hasReturning(node.expression)) return;

        // Only flag if result is consumed (assigned) — void insert/update is intentional
        const isAssigned =
          ts.isVariableDeclaration(node.parent) ||
          ts.isPropertyAssignment(node.parent) ||
          (ts.isBinaryExpression(node.parent) &&
            node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken);

        if (isAssigned) {
          ctx.reportAt(
            node,
            "Add .returning() to db.insert/update -- extra SELECT needed without it",
            {
              action: "add-returning",
              pattern: "const [result] = await db.insert(table).values(data).returning();",
              fix: ctx.insertAfter(node.expression, ".returning()"),
            }
          );
        }
      }
    });
  },
});
