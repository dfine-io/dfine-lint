// Prevents string-as-code: direct eval(), string args to setTimeout/setInterval,
// and the new Function() / Function() constructor which compile strings at runtime.
// Verifies the callee is the lib global, and Function by its FunctionConstructor type (aliases included).
import ts from "typescript";
import { defineRule, extendsLibType, isStringType, resolveCallee } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const EVAL_FUNCTIONS = new Set([
  "eval",
  "setTimeout",
  "setInterval",
]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description: "No string-as-code in eval/setTimeout/setInterval/Function (implied eval)",
  },
  check(ctx) {
    const evalFunctions = ctx.options.evalFunctions ? new Set(ctx.options.evalFunctions as string[]) : EVAL_FUNCTIONS;
    // Function by its FunctionConstructor type: Function, globalThis.Function and const F = Function alike
    const isFunctionCtor = (callee: ts.Expression): boolean =>
      extendsLibType(ctx.checker.getTypeAtLocation(callee), ctx.checker, ["FunctionConstructor"]);
    ctx.walk((node) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        // eval, window.setTimeout or globalThis.eval: the lib global, however it is reached
        const callee = resolveCallee(node, ctx.checker);
        const isEval = !!callee?.lib && evalFunctions.has(callee.name);
        if (!isEval && !isFunctionCtor(node.expression)) return;
        const codeArg = node.arguments[0];
        if (!codeArg) return;
        const type = ctx.checker.getTypeAtLocation(codeArg);
        if (isStringType(type)) {
          ctx.reportAt(
            codeArg,
            `${callee?.name ?? "Function"}() runs a string as code — pass a function or remove dynamic evaluation`,
            {
              action: "no-string-eval",
              pattern: "Pass a function or value, never a code string",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval",
            }
          );
        }
      }
      if (ts.isNewExpression(node) && isFunctionCtor(node.expression)) {
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
