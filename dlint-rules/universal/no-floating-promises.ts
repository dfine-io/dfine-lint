// Ensures every Promise is consumed: awaited, void-wrapped, assigned, or .catch()-guarded.
// Unhandled Promises silently swallow errors and cause unpredictable execution order.
// Exempts logger calls which use fire-and-forget by convention.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function isLoggerCall(expr: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (!ts.isPropertyAccessExpression(expr.expression)) return false;
  const obj = expr.expression.expression;
  const type = checker.getTypeAtLocation(obj);
  if (!type.getProperty("info") || !type.getProperty("warn") || !type.getProperty("error")) return false;
  const sym = checker.getSymbolAtLocation(obj);
  return sym?.declarations?.some((d) => !d.getSourceFile().fileName.includes("lib.dom")) ?? false;
}

function hasCatchInChain(
  expr: ts.CallExpression,
  checker: ts.TypeChecker
): boolean {
  if (!ts.isPropertyAccessExpression(expr.expression)) return false;
  const methodName = expr.expression.name.text;
  if (methodName === "catch" || (methodName === "then" && expr.arguments.length >= 2)) {
    // Verify receiver is thenable via TypeChecker — not just any .catch()
    const receiverType = checker.getTypeAtLocation(expr.expression.expression);
    return isThenable(receiverType, checker);
  }
  // Recurse into inner call: .catch().then() or .then(resolve).catch()
  if (ts.isCallExpression(expr.expression.expression)) {
    return hasCatchInChain(expr.expression.expression, checker);
  }
  return false;
}


function isThenable(type: ts.Type, checker: ts.TypeChecker): boolean {
  const thenProp = type.getProperty("then");
  if (thenProp) {
    const thenType = checker.getTypeOfSymbol(thenProp);
    if (thenType.getCallSignatures().length > 0) return true;
  }
  if (type.isUnion()) return type.types.some((t) => isThenable(t, checker));
  if (type.isIntersection()) return type.types.some((t) => isThenable(t, checker));
  return false;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No floating promises without await or catch",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (ts.isExpressionStatement(node)) {
        const expr = node.expression;
        if (ts.isAwaitExpression(expr) || ts.isVoidExpression(expr)) return;
        // Skip assignments (=, +=, etc.) — promise is stored, not floating
        if (
          ts.isBinaryExpression(expr) &&
          expr.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          expr.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
          return;
        }
        const type = ctx.checker.getTypeAtLocation(expr);
        if (!isThenable(type, ctx.checker)) return;
        // Call-specific handling: .catch() chain, logger exemption
        if (ts.isCallExpression(expr)) {
          if (hasCatchInChain(expr, ctx.checker)) return;
          if (isLoggerCall(expr, ctx.checker)) return;
        }
        // Fix: only simple call expressions — ternary/conditional requires human decision
        const canAutoFix = ts.isCallExpression(expr) && !ts.isConditionalExpression(expr.parent);
        ctx.reportAt(
          expr,
          `Await or catch floating Promise: ${ctx.checker.typeToString(type)}`,
          {
            action: "add-await",
            pattern: "Await the Promise or guard with .catch(handler)",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise",
            fix: canAutoFix ? ctx.insertBefore(expr, "await ") : undefined,
          }
        );
      }
    });
  },
});
