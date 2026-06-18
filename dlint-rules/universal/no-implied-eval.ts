// Prevents string-as-code: direct eval(), string args to setTimeout/setInterval/execScript,
// and the new Function() / Function() constructor which compile strings at runtime.
// Verifies callee is the global lib declaration via TypeChecker symbol resolution.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const EVAL_FUNCTIONS = new Set([
  "eval",
  "setTimeout",
  "setInterval",
  "execScript",
  "Function",
]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description: "No string-as-code in eval/setTimeout/setInterval/Function (implied eval)",
  },
  check(ctx) {
    const evalFunctions = ctx.options.evalFunctions ? new Set(ctx.options.evalFunctions as string[]) : EVAL_FUNCTIONS;
    ctx.walk((node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        evalFunctions.has(node.expression.text) &&
        node.arguments.length > 0
      ) {
        const evalSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!evalSym || !isLibDeclaration(evalSym)) return;
        const codeArg = node.arguments[0];
        if (!codeArg) return;
        const type = ctx.checker.getTypeAtLocation(codeArg);
        if (
          type.flags &
          (ts.TypeFlags.String |
            ts.TypeFlags.StringLiteral |
            ts.TypeFlags.TemplateLiteral)
        ) {
          ctx.reportAt(
            codeArg,
            `${node.expression.text}() runs a string as code — pass a function or remove dynamic evaluation`,
            {
              action: "no-string-eval",
              pattern: "Pass a function or value, never a code string",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval",
            }
          );
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "Function"
      ) {
        const fnSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!fnSym || !isLibDeclaration(fnSym)) return;
        ctx.reportAt(
          node,
          "Implied eval: new Function() — use a regular function",
          {
            action: "use-function",
            pattern:
              "Replace new Function() with a regular function declaration",
          }
        );
      }
    });
  },
});
