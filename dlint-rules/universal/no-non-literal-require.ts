// Flags require()/dynamic import() with a parameter-derived module specifier (arbitrary module load).
// Allows static literal specifiers. Self-contained: inlines node-require detection + parameter-taint.
import ts from "typescript";
import { defineRule, resolveSymbol } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "security",
    description: "No require()/import() with a parameter-derived module specifier",
  },
  check(ctx) {
    const checker = ctx.checker;

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

    // `require` must resolve to the Node global typing, not a local binding of the same name.
    function isNodeRequire(id: ts.Identifier): boolean {
      if (id.text !== "require") return false;
      const sym = checker.getSymbolAtLocation(id);
      if (!sym) return false;
      return (resolveSymbol(checker, sym).declarations ?? []).some((decl) =>
        decl.getSourceFile().fileName.includes("/@types/node/"),
      );
    }

    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
      const spec = node.arguments[0];
      if (!spec || !tracesToParameter(spec)) return;

      // dynamic import(x)
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        ctx.reportAt(
          spec,
          "Dynamic import() with a parameter-derived specifier — load only from a fixed allowlist",
          { action: "allowlist-import", pattern: "Map untrusted keys to a fixed set of static imports", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html" },
        );
        return;
      }
      // require(x)
      if (ts.isIdentifier(node.expression) && isNodeRequire(node.expression)) {
        ctx.reportAt(
          spec,
          "require() with a parameter-derived specifier — load only from a fixed allowlist",
          { action: "allowlist-require", pattern: "Map untrusted keys to a fixed set of static requires", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html" },
        );
      }
    });
  },
});
