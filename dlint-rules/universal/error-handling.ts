// Detects error handling antipatterns: empty catch blocks that swallow errors,
// and re-throw without error cause chain for debugging.
// Proper error handling preserves stack traces and error context.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

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
            ts.isNewExpression(stmt.expression) && ts.isIdentifier(stmt.expression.expression) &&
            stmt.expression.expression.text === "Error" && stmt.expression.arguments?.length === 1
          ) {
            const errSym = ctx.checker.getSymbolAtLocation(stmt.expression.expression);
            if (errSym && isLibDeclaration(errSym)) {
              const catchVarName = node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name) ? node.variableDeclaration.name.text : undefined;
              const causeArg = stmt.expression.arguments?.[0];
              const causeFix = catchVarName && causeArg ? ctx.insertAfter(causeArg, ", { cause: " + catchVarName + " }") : undefined;
              ctx.reportAt(stmt, "Add { cause: original } to new Error re-throw for error chain", { action: "use-error-cause", pattern: "Wrap message with { cause: error } in new Error constructor", fix: causeFix, reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause" });
            }
          }
        }
      }
    });
  },
});
