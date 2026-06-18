// Flags RegExp built from a parameter-derived pattern (ReDoS / regex-injection surface).
// Allows static literal patterns and /regex/ literals.
// Self-contained: inlines its own parameter-taint walk; uses only the SDK's generic isLibDeclaration.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "security",
    description: "No RegExp built from a parameter-derived pattern (ReDoS risk)",
  },
  check(ctx) {
    const checker = ctx.checker;

    // Intra-procedural data-flow: does `node` originate from a function parameter?
    function tracesToParameter(node: ts.Node, seen: Set<ts.Node> = new Set()): boolean {
      if (ts.isIdentifier(node)) {
        const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (!decl || seen.has(decl)) return false;
        if (ts.isParameter(decl)) return true;
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          seen.add(decl);
          return tracesToParameter(decl.initializer, seen);
        }
        return false;
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        return tracesToParameter(node.expression, seen);
      if (ts.isTemplateExpression(node))
        return node.templateSpans.some((s) => tracesToParameter(s.expression, seen));
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken
      )
        return tracesToParameter(node.left, seen) || tracesToParameter(node.right, seen);
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isNonNullExpression(node)
      )
        return tracesToParameter(node.expression, seen);
      return false;
    }

    ctx.walk((node) => {
      // new RegExp(x) or RegExp(x)
      if (!ts.isNewExpression(node) && !ts.isCallExpression(node)) return;
      const callee = node.expression;
      if (!ts.isIdentifier(callee) || callee.text !== "RegExp") return;
      const args = node.arguments;
      if (!args || args.length === 0) return;
      // Verify RegExp is the global, not a local shadow
      const sym = checker.getSymbolAtLocation(callee);
      if (!sym || !isLibDeclaration(sym)) return;
      const pattern = args[0];
      if (!pattern || !tracesToParameter(pattern)) return;
      ctx.reportAt(
        pattern,
        "RegExp built from a parameter-derived pattern -- use a static literal or escape untrusted input (ReDoS risk)",
        {
          action: "use-static-regex",
          pattern: "Use a literal /regex/ or escape untrusted input before new RegExp()",
          reference: "https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS",
        },
      );
    });
  },
});
