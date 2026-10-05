// Detects error handling antipatterns: empty catch blocks that swallow errors,
// and re-throw without error cause chain for debugging.
// Proper error handling preserves stack traces and error context.
import ts from "typescript";
import { defineRule, resolveCallee } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Error handling: empty catch, missing error cause",
    subChecks: 2,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-error-swallow: empty catch block without comment
      if (ts.isCatchClause(node) && node.block.statements.length === 0) {
        // An intentional-empty catch is marked by any comment inside the block.
        if (!/\/\*|\/\//.test(node.block.getText(ctx.sourceFile))) {
          ctx.reportAt(node, "Handle the caught error or add an intentional-empty comment", { action: "handle-error", pattern: "catch (error) { /* intentionally empty */ } or handle" });
        }
      }

      // use-error-cause: throw new Error(msg) in catch → add { cause }
      if (
        ts.isCatchClause(node) && node.block.statements.length > 0
      ) {
        for (const stmt of node.block.statements) {
          if (
            ts.isThrowStatement(stmt) && stmt.expression &&
            ts.isNewExpression(stmt.expression) && stmt.expression.arguments?.length === 1
          ) {
            // A lib error class whose constructor takes { cause } second (Error, TypeError …; not DOMException)
            const created = stmt.expression;
            const takesCause = (): boolean => ctx.checker.getTypeAtLocation(created.expression).getConstructSignatures().some((sig) => {
              const options = sig.getParameters()[1];
              return !!options && ctx.checker.getNonNullableType(ctx.checker.getTypeOfSymbol(options)).getProperty("cause") !== undefined;
            });
            if (resolveCallee(created, ctx.checker)?.lib && takesCause()) {
              ctx.reportAt(stmt, "Add { cause: original } to new Error re-throw for error chain", { action: "use-error-cause", pattern: "Wrap message with { cause: error } in new Error constructor", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause" });
            }
          }
        }
      }
    });
  },
});
