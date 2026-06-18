// Flags a binary expression whose two operands are the SAME pure value reference, making
// the expression redundant or always-constant (a && a, x - x, n > n, p | p).
// Excludes + and * (doubling/squaring are legitimate) and equality operators (self-compare is
// handled by `correctness`). Operands with side effects (calls, getters) are never flagged, so
// the finding is always a real bug. Self-contained: inlines its own purity + same-ref checks.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

const REDUNDANT_OPS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandToken,
  ts.SyntaxKind.BarToken,
  ts.SyntaxKind.CaretToken,
]);

export default defineRule({
  meta: {
    category: "quality",
    description: "No binary expression with identical operands (redundant or always-constant)",
  },
  check(ctx) {
    const checker = ctx.checker;

    // Safe to read twice: identifiers, this, literals, and property/element chains of those.
    // Getter access and calls may have side effects, so they are not pure.
    function isPure(n: ts.Node): boolean {
      const node = ts.isParenthesizedExpression(n) ? n.expression : n;
      if (
        ts.isIdentifier(node) ||
        node.kind === ts.SyntaxKind.ThisKeyword ||
        ts.isNumericLiteral(node) ||
        ts.isStringLiteral(node)
      )
        return true;
      if (ts.isPropertyAccessExpression(node)) {
        const sym = checker.getSymbolAtLocation(node);
        if (sym && sym.flags & ts.SymbolFlags.GetAccessor) return false;
        return isPure(node.expression);
      }
      if (ts.isElementAccessExpression(node))
        return isPure(node.expression) && isPure(node.argumentExpression);
      return false;
    }

    function sameRef(x: ts.Node, y: ts.Node): boolean {
      const a = ts.isParenthesizedExpression(x) ? x.expression : x;
      const b = ts.isParenthesizedExpression(y) ? y.expression : y;
      if (a.kind !== b.kind) return false;
      if (ts.isIdentifier(a) && ts.isIdentifier(b)) {
        const sa = checker.getSymbolAtLocation(a);
        const sb = checker.getSymbolAtLocation(b);
        return !!sa && sa === sb;
      }
      if (a.kind === ts.SyntaxKind.ThisKeyword) return true;
      if (ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b))
        return a.name.text === b.name.text && sameRef(a.expression, b.expression);
      if (ts.isElementAccessExpression(a) && ts.isElementAccessExpression(b))
        return sameRef(a.expression, b.expression) && sameRef(a.argumentExpression, b.argumentExpression);
      if (ts.isNumericLiteral(a) && ts.isNumericLiteral(b)) return a.text === b.text;
      if (ts.isStringLiteral(a) && ts.isStringLiteral(b)) return a.text === b.text;
      return false;
    }

    ctx.walk((node) => {
      if (!ts.isBinaryExpression(node)) return;
      if (!REDUNDANT_OPS.has(node.operatorToken.kind)) return;
      if (!isPure(node.left) || !isPure(node.right)) return;
      if (!sameRef(node.left, node.right)) return;
      ctx.reportAt(node, "Identical operands -- this expression is redundant or always constant", {
        action: "fix-identical-operands",
        pattern: "Remove the duplicated operand or fix the typo - both sides are identical",
        reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators",
      });
    });
  },
});
