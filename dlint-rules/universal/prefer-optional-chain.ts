// Suggests ?. over && chains for property access (a && a.b to a?.b).
// Reduces boilerplate and prevents accidental truthiness checks on falsy-but-valid values.
// Uses symbol resolution to verify both sides of the chain reference the same variable.
import ts from "typescript";
import { defineRule, isSameReference } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Prefer ?. over && chains for property access",
  },
  check(ctx) {
    function getChainText(node: ts.Expression): string {
      if (ts.isIdentifier(node)) return node.text;
      if (ts.isPropertyAccessExpression(node))
        return `${getChainText(node.expression)}.${node.name.text}`;
      return node.getText(ctx.sourceFile);
    }

    ctx.walk((node) => {
      if (
        !ts.isBinaryExpression(node) ||
        node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
      )
        return;
      const { left, right } = node;

      // a && a.b
      if (
        ts.isIdentifier(left) &&
        ts.isPropertyAccessExpression(right) &&
        ts.isIdentifier(right.expression) &&
        isSameReference(left, right.expression, ctx.checker)
      ) {
        report(left.text, right, node);
        return;
      }
      // a.b && a.b.c
      if (
        ts.isPropertyAccessExpression(left) &&
        ts.isPropertyAccessExpression(right) &&
        ts.isPropertyAccessExpression(right.expression)
      ) {
        if (isSameReference(left, right.expression, ctx.checker)) {
          const lc = getChainText(left);
          report(lc, right, node);
          return;
        }
      }
      // a != null && a.b
      if (
        ts.isBinaryExpression(left) &&
        (left.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
          left.operatorToken.kind ===
            ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        // null, undefined, a shadow-proof void 0: the compared side's type is nullish
        (ctx.checker.getTypeAtLocation(left.right).flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0 &&
        ts.isPropertyAccessExpression(right)
      ) {
        if (ts.isIdentifier(left.left) && ts.isIdentifier(right.expression) && isSameReference(left.left, right.expression, ctx.checker)) {
          report(left.left.text, right, node);
        }
      }
    });

    function report(
      base: string,
      access: ts.PropertyAccessExpression,
      node: ts.Node
    ): void {
      ctx.reportAt(
        node,
        `Prefer optional chain: ${base}?.${access.name.text}`,
        {
          action: "use-optional-chain",
          pattern: `Use optional chain ${base}?.${access.name.text} instead of && guard`,
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining",
        }
      );
    }
  },
});
