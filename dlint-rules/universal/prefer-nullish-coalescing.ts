// Suggests ?? over || when the left operand is nullable.
// The || operator also catches "", 0, false — unintended in nullable contexts.
// Skips boolean context (if/while/ternary condition) and any/unknown types.
import ts from "typescript";
import {
  defineRule,
  isInBooleanContext,
  isNullableType,
} from "@dfine-io-gmbh/dlint";

function isBooleanType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const clean = checker.getNonNullableType(type);
  if (clean.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return true;
  if (clean.isUnion()) return clean.types.every(
    (t) => t.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral));
  return false;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Prefer ?? over || for nullable values",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (
        !ts.isBinaryExpression(node) ||
        node.operatorToken.kind !== ts.SyntaxKind.BarBarToken
      )
        return;
      const leftType = ctx.checker.getTypeAtLocation(node.left);
      if (leftType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
      // Skip: || in boolean context (if/while/ternary condition) — intentional truthiness check
      if (isInBooleanContext(node)) return;
      if (isNullableType(leftType) && !isBooleanType(leftType, ctx.checker)) {
        ctx.reportAt(
          node.operatorToken,
          "Prefer ?? over || for nullable value — || coerces falsy values",
          {
            action: "use-nullish-coalescing",
            pattern: "value ?? fallback instead of value || fallback",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing",
            fix: ctx.createFix(node.operatorToken, "??"),
          }
        );
      }
    });
  },
});
