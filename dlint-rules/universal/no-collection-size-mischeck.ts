// Flags a collection length/size comparison that is statically always true or always false,
// because .length (Array/string) and .size (Map/Set) are always non-negative integers.
// e.g. arr.length >= 0 (always true), set.size < 0 (always false), s.length > -1 (always true).
// TypeChecker-guarded to a real builtin collection / string, so the finding is always a real bug.
import ts from "typescript";
import { defineRule, isBuiltinCollection } from "@dfine-io-gmbh/dlint";

const COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

// Returns "always true" / "always false" for `L <op> R` given L is a non-negative integer,
// or null when the comparison is meaningful (depends on the actual size).
function constantVerdict(op: ts.SyntaxKind, r: number): "always true" | "always false" | null {
  if (r < 0) {
    if (
      op === ts.SyntaxKind.GreaterThanToken ||
      op === ts.SyntaxKind.GreaterThanEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken
    )
      return "always true";
    return "always false"; // <, <=, ==, ===  vs a negative
  }
  if (r === 0) {
    if (op === ts.SyntaxKind.GreaterThanEqualsToken) return "always true"; // L >= 0
    if (op === ts.SyntaxKind.LessThanToken) return "always false"; // L < 0
  }
  return null;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No length/size comparison that is always true or always false",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isBinaryExpression(node)) return;
      if (!COMPARISONS.has(node.operatorToken.kind)) return;
      if (!ts.isPropertyAccessExpression(node.left)) return;
      const prop = node.left.name.text;
      if (prop !== "length" && prop !== "size") return;

      // Resolve the numeric literal on the right (plain or negated).
      const right = node.right;
      let r: number;
      if (ts.isNumericLiteral(right)) r = Number(right.text);
      else if (
        ts.isPrefixUnaryExpression(right) &&
        right.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(right.operand)
      )
        r = -Number(right.operand.text);
      else return;

      const verdict = constantVerdict(node.operatorToken.kind, r);
      if (!verdict) return;

      // Guard: receiver must be a real collection/string so length/size is truly non-negative.
      const recvType = ctx.checker.getTypeAtLocation(node.left.expression);
      const isStringLike = !!(recvType.flags & ts.TypeFlags.StringLike);
      const isCollection = isBuiltinCollection(recvType, ctx.checker);
      const guardOk =
        (prop === "length" && (isCollection || isStringLike)) || (prop === "size" && isCollection);
      if (!guardOk) return;

      ctx.reportAt(node, `Comparison is ${verdict} -- .${prop} is never negative`, {
        action: "fix-size-comparison",
        pattern: "Compare against a meaningful bound - .length/.size is always >= 0",
        reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/length",
      });
    });
  },
});
