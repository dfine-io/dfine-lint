// Prevents Object.prototype.toString() producing [object Object].
// Flags explicit .toString() and implicit + coercion on types without own toString().
// Catches silent data corruption in string interpolation and concatenation contexts.
import ts from "typescript";
import { defineRule, hasOwnToString } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No Object.prototype.toString() — objects need own toString()",
  },
  check(ctx) {

    ctx.walk((node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "toString"
      ) {
        const objType = ctx.checker.getTypeAtLocation(
          node.expression.expression
        );
        if (!hasOwnToString(objType, ctx.checker)) {
          const objText = node.expression.expression.getText(ctx.sourceFile);
          ctx.reportAt(
            node.expression.expression,
            `Add own toString() to '${ctx.checker.typeToString(objType)}' -- falls back to [object Object]`,
            {
              action: "add-to-string",
              pattern: "Implement toString() or use JSON.stringify()",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString",
              fix: ctx.createFix(node, "JSON.stringify(" + objText + ")"),
            }
          );
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken
      ) {
        const lt = ctx.checker.getTypeAtLocation(node.left);
        const rt = ctx.checker.getTypeAtLocation(node.right);
        const lStr =
          lt.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral);
        const rStr =
          rt.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral);
        if (lStr && !hasOwnToString(rt, ctx.checker)) {
          ctx.reportAt(
            node.right,
            `Convert '${ctx.checker.typeToString(rt)}' explicitly before + operator`,
            {
              action: "add-to-string",
              pattern: "Implement toString() or use JSON.stringify()",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString",
              fix: ctx.createFix(node.right, "JSON.stringify(" + node.right.getText(ctx.sourceFile) + ")"),
            }
          );
        } else if (rStr && !hasOwnToString(lt, ctx.checker)) {
          ctx.reportAt(
            node.left,
            `'${ctx.checker.typeToString(lt)}' implicitly converted to string via + operator`,
            {
              action: "add-to-string",
              pattern: "Implement toString() or use JSON.stringify()",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString",
              fix: ctx.createFix(node.left, "JSON.stringify(" + node.left.getText(ctx.sourceFile) + ")"),
            }
          );
        }
      }
    });
  },
});
