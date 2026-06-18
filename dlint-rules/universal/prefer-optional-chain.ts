// Suggests ?. over && chains for property access (a && a.b to a?.b).
// Reduces boilerplate and prevents accidental truthiness checks on falsy-but-valid values.
// Uses symbol resolution to verify both sides of the chain reference the same variable.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function chainsMatch(a: ts.Expression, b: ts.Expression, checker: ts.TypeChecker): boolean {
  if (ts.isIdentifier(a) && ts.isIdentifier(b)) {
    const symA = checker.getSymbolAtLocation(a);
    return !!symA && symA === checker.getSymbolAtLocation(b);
  }
  if (ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b)) {
    const symA = checker.getSymbolAtLocation(a.name);
    return !!symA && symA === checker.getSymbolAtLocation(b.name) &&
      chainsMatch(a.expression, b.expression, checker);
  }
  return false;
}

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
        (() => { const s = ctx.checker.getSymbolAtLocation(left); return !!s && s === ctx.checker.getSymbolAtLocation(right.expression); })()
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
        if (chainsMatch(left, right.expression, ctx.checker)) {
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
        (left.right.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(left.right) && left.right.text === "undefined")) &&
        ts.isPropertyAccessExpression(right)
      ) {
        if (ts.isIdentifier(left.left) && ts.isIdentifier(right.expression)) {
          const sym = ctx.checker.getSymbolAtLocation(left.left);
          if (sym && sym === ctx.checker.getSymbolAtLocation(right.expression)) {
            report(left.left.text, right, node);
          }
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
          fix: ctx.createFix(node, base + "?." + access.name.text),
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining",
        }
      );
    }
  },
});
