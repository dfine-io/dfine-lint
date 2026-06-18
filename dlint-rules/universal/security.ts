// Flags security issues: prototype pollution, innerHTML, javascript: URLs, document.write.
// All sub-checks use TypeChecker for deterministic detection.
// Secret detection is delegated to environment scanning, not static analysis.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================

const DANGEROUS_URL_SCHEMES = ["javascript:", "data:", "vbscript:"];

// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description: "Prototype pollution, XSS vectors (dangerouslySetInnerHTML, javascript: URL, document.write)",
    subChecks: 4,
  },
  check(ctx) {
    const dangerousUrlSchemes = ctx.options.dangerousUrlSchemes ? (ctx.options.dangerousUrlSchemes as string[]) : DANGEROUS_URL_SCHEMES;

    ctx.walk((node) => {
      // no-prototype-pollution: obj[dynamicKey] = value (only flag user-input keys)
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isElementAccessExpression(node.left)
      ) {
        const objApparent = ctx.checker.getApparentType(
          ctx.checker.getTypeAtLocation(node.left.expression)
        );
        if (ctx.checker.getIndexInfosOfType(objApparent).length > 0) return;

        const key = node.left.argumentExpression;
        if (key && !ts.isStringLiteral(key) && !ts.isNumericLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key)) {
          // Skip: property access chain (obj.field) — key from trusted source (DB, generated ID)
          if (ts.isPropertyAccessExpression(key)) return;
          // Skip: identifier that looks like a typed variable (not raw user input)
          if (ts.isIdentifier(key)) {
            const keyType = ctx.checker.getTypeAtLocation(key);
            // String literal types and enum members are safe keys
            if (keyType.isStringLiteral() || keyType.isNumberLiteral()) return;
            if (keyType.isUnion() && keyType.types.every((t) => t.isStringLiteral() || t.isNumberLiteral())) return;
          }
          ctx.reportAt(node, "Validate key before dynamic property assignment -- prevents prototype pollution", { action: "validate-key", pattern: "Guard the key against __proto__ and constructor", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" });
        }
      }

      // dangerouslySetInnerHTML — flag only when value is not a structurally-static literal
      if (
        ts.isJsxAttribute(node) && ts.isIdentifier(node.name) &&
        node.name.text === "dangerouslySetInnerHTML" && node.initializer &&
        ts.isJsxExpression(node.initializer) && node.initializer.expression &&
        ts.isObjectLiteralExpression(node.initializer.expression)
      ) {
        const htmlProp = node.initializer.expression.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "__html"
        );
        const htmlValue = htmlProp?.initializer;
        const isStaticLiteral = htmlValue !== undefined && (
          ts.isStringLiteral(htmlValue) ||
          ts.isNoSubstitutionTemplateLiteral(htmlValue)
        );
        if (!isStaticLiteral) {
          ctx.reportAt(node, "dangerouslySetInnerHTML — ensure content is sanitized", { action: "sanitize-html", pattern: "Sanitize content first - use DOMPurify or similar", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" });
        }
      }

      // dangerous URL scheme (javascript:/data:/vbscript:)
      if (
        ts.isJsxAttribute(node) && ts.isIdentifier(node.name) &&
        node.name.text === "href" && node.initializer
      ) {
        const checkVal = (v: ts.Expression): void => {
          if (!ts.isStringLiteral(v)) return;
          const normalized = v.text.trim().toLowerCase();
          if (dangerousUrlSchemes.some((scheme) => normalized.startsWith(scheme))) {
            ctx.reportAt(node, "Dangerous URL scheme (javascript:/data:/vbscript:) is an XSS vector", { action: "remove-dangerous-url-scheme", pattern: "Use an https: URL or an onClick handler", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" });
          }
        };
        if (ts.isStringLiteral(node.initializer)) checkVal(node.initializer);
        if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          checkVal(node.initializer.expression);
        }
      }

      // document.write
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "document" && node.expression.name.text === "write"
      ) {
        const docSym = ctx.checker.getSymbolAtLocation(node.expression.expression);
        if (!docSym || !isLibDeclaration(docSym)) return;
        ctx.reportAt(node, "document.write() — use DOM manipulation instead", { action: "use-dom-api", pattern: "Use document.createElement() or el.textContent", reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" });
      }
    });
  },
});
