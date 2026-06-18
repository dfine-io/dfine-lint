// Prevents implicit type coercion in + operations: string+number, bigint+non-bigint.
// Catches silent string concatenation bugs where arithmetic was intended.
// Skips any/unknown types to avoid false positives on untyped code.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

const STRING_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.TemplateLiteral;
const NUMBER_FLAGS = ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral;
const BIGINT_FLAGS = ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral;

function getBaseFlags(type: ts.Type): number {
  if (type.isUnion())
    return type.types.reduce((f, t) => f | getBaseFlags(t), 0);
  if (type.isIntersection())
    return type.types.reduce((f, t) => f | getBaseFlags(t), 0);
  return type.flags;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Type-safe + operations — no implicit coercion",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (
        !ts.isBinaryExpression(node) ||
        node.operatorToken.kind !== ts.SyntaxKind.PlusToken
      )
        return;
      const lType = ctx.checker.getTypeAtLocation(node.left);
      const rType = ctx.checker.getTypeAtLocation(node.right);
      const lf = getBaseFlags(lType);
      const rf = getBaseFlags(rType);
      if ((lf | rf) & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;

      let problem: string | null = null;
      if (lf & STRING_FLAGS && rf & NUMBER_FLAGS) problem = "string + number";
      else if (lf & NUMBER_FLAGS && rf & STRING_FLAGS)
        problem = "number + string";
      else if (lf & BIGINT_FLAGS && !(rf & BIGINT_FLAGS))
        problem = `bigint + ${ctx.checker.typeToString(rType)}`;
      else if (!(lf & BIGINT_FLAGS) && rf & BIGINT_FLAGS)
        problem = `${ctx.checker.typeToString(lType)} + bigint`;

      if (problem) {
        let plusFix;
        if (lf & STRING_FLAGS && rf & NUMBER_FLAGS) {
          plusFix = ctx.createFix(node.right, "String(" + node.right.getText(ctx.sourceFile) + ")");
        } else if (lf & NUMBER_FLAGS && rf & STRING_FLAGS) {
          plusFix = ctx.createFix(node.left, "String(" + node.left.getText(ctx.sourceFile) + ")");
        }
        ctx.reportAt(
          node.operatorToken,
          `Use explicit conversion for '+' operation: ${problem}`,
          {
            action: "explicit-conversion",
            pattern: "Wrap the numeric operand in String()",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Addition",
            fix: plusFix,
          }
        );
      }
    });
  },
});
