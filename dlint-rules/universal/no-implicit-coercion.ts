// Detects implicit type coercion: == instead of ===, +x instead of Number(x),
// ""+x instead of String(x), !! in boolean context.
// Explicit conversions make intent clear and prevent subtle bugs.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

/** NullKeyword or undefined type (TypeChecker-verified, not name-based) */
function isNullishLiteral(n: ts.Node, checker: ts.TypeChecker): boolean {
  if (n.kind === ts.SyntaxKind.NullKeyword) return true;
  return (checker.getTypeAtLocation(n).flags & ts.TypeFlags.Undefined) !== 0;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Implicit coercion: ==, +x, ''+x, !! in boolean context",
    subChecks: 4,
  },
  check(ctx) {
    const offPlus = ctx.isSubCheckDisabled("plus-coercion");
    const offConcat = ctx.isSubCheckDisabled("string-concat");
    const offDoubleNeg = ctx.isSubCheckDisabled("double-negation");
    ctx.walk((node) => {
      // no-double-equals: == instead of ===
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)
      ) {
        if (isNullishLiteral(node.right, ctx.checker) || isNullishLiteral(node.left, ctx.checker)) return;
        const isEq = node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;
        ctx.reportAt(node.operatorToken, `Use ${isEq ? "===" : "!=="} instead of ${isEq ? "==" : "!="}`, { action: "use-strict-equality", pattern: "value === other or value !== other", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness", fix: ctx.createFix(node.operatorToken, isEq ? "===" : "!==") });
      }

      // no-implicit-coercion: +x → Number(x) (skip if operand is already number)
      if (
        !offPlus &&
        ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.PlusToken &&
        !ts.isNumericLiteral(node.operand) &&
        (ts.isParenthesizedExpression(node.operand) || ts.isIdentifier(node.operand))
      ) {
        const operandType = ctx.checker.getTypeAtLocation(node.operand);
        if (!(operandType.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))) {
          ctx.reportAt(node, "Use Number(x) instead of +x", { action: "use-number-constructor", pattern: "Number(x) for numeric conversion", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness", fix: ctx.createFix(node, "Number(" + node.operand.getText(ctx.sourceFile) + ")") });
        }
      }
      // no-implicit-coercion: "" + x → String(x) (skip if right is already string)
      if (
        !offConcat &&
        ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        ts.isStringLiteral(node.left) && node.left.text === "" && !ts.isStringLiteral(node.right)
      ) {
        const rightType = ctx.checker.getTypeAtLocation(node.right);
        if (!(rightType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral))) {
          ctx.reportAt(node, 'Use String(x) instead of "" + x', { action: "use-string-constructor", pattern: "String(x) instead of '' + x", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness", fix: ctx.createFix(node, "String(" + node.right.getText(ctx.sourceFile) + ")") });
        }
      }

      // !! in boolean context (skip if operand is already boolean)
      if (
        !offDoubleNeg &&
        ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken &&
        ts.isPrefixUnaryExpression(node.operand) && node.operand.operator === ts.SyntaxKind.ExclamationToken
      ) {
        const innerType = ctx.checker.getTypeAtLocation(node.operand.operand);
        if (innerType.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return;
        let current: ts.Node = node;
        while (current.parent) {
          if (
            (ts.isIfStatement(current.parent) && current.parent.expression === current) ||
            (ts.isWhileStatement(current.parent) && current.parent.expression === current) ||
            (ts.isDoStatement(current.parent) && current.parent.expression === current) ||
            (ts.isConditionalExpression(current.parent) && current.parent.condition === current)
          ) {
            ctx.reportAt(node, "Unnecessary !! in boolean context", { action: "remove-double-negation", pattern: "Remove !!, condition already boolean", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness", fix: ctx.createFix(node, node.operand.operand.getText(ctx.sourceFile)) });
            return;
          }
          if (ts.isParenthesizedExpression(current.parent)) { current = current.parent; continue; }
          break;
        }
      }
    });
  },
});
