// Prevents Server-Side Request Forgery in Server Actions.
// Flags fetch() calls where the URL is derived from function parameters.
// Allows static URLs and non-parameter template literals.
// Traces parameter flow through variable declarations and property accesses.
import ts from "typescript";
import {
  defineRule,
  hasDirective,
  getExportedFunctions,
  resolveCallee,
} from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "security",
    description: "No fetch() with user-controlled URL in Server Actions",
  },
  check(ctx) {
    if (!hasDirective(ctx.sourceFile, "use server")) return;
    // Only scan exported SA functions — internal helpers are trusted
    const exportedBodies = new Set<ts.Node>();
    for (const fn of getExportedFunctions(ctx.sourceFile, ctx.checker)) {
      if (fn.body) exportedBodies.add(fn.body);
    }
    function isParameterDerived(node: ts.Node): boolean {
      if (ts.isIdentifier(node)) {
        const sym = ctx.checker.getSymbolAtLocation(node);
        const decl = sym?.valueDeclaration;
        if (!decl) return false;
        if (ts.isParameter(decl)) return true;
        if (ts.isVariableDeclaration(decl) && decl.initializer)
          return isParameterDerived(decl.initializer);
        return false;
      }
      if (ts.isPropertyAccessExpression(node)) return isParameterDerived(node.expression);
      return false;
    }

    // Stateful traversal — track inExported as descent state (O(1) per node vs O(depth))
    function walkNode(node: ts.Node, inExported: boolean): void {
      if (exportedBodies.has(node)) inExported = true;
      if (
        inExported &&
        ts.isCallExpression(node) &&
        node.arguments.length > 0
      ) {
        // The global fetch (TS lib DOM or @types/node), globalThis.fetch included; a local fetch helper is not it
        const callee = resolveCallee(node, ctx.checker);
        if (!callee?.global || callee.name !== "fetch") {
          ts.forEachChild(node, (c) => walkNode(c, inExported));
          return;
        }
        const urlArg = node.arguments[0];
        if (!urlArg) {
          ts.forEachChild(node, (c) => walkNode(c, inExported));
          return;
        }
        // Allow: static string or template literal
        if (ts.isStringLiteral(urlArg) || ts.isNoSubstitutionTemplateLiteral(urlArg)) {
          ts.forEachChild(node, (c) => walkNode(c, inExported));
          return;
        }
        // Allow: template expressions — only if no span contains parameter-derived value
        if (ts.isTemplateExpression(urlArg)) {
          const hasParamSpan = urlArg.templateSpans.some((span) =>
            isParameterDerived(span.expression)
          );
          if (!hasParamSpan) {
            ts.forEachChild(node, (c) => walkNode(c, inExported));
            return;
          }
        }
        // Allow: identifier only if not derived from a function parameter
        if (ts.isIdentifier(urlArg) && !isParameterDerived(urlArg)) {
          ts.forEachChild(node, (c) => walkNode(c, inExported));
          return;
        }
        // Allow: property access only if not derived from a parameter, through variables too (const p = params; p.url)
        if (ts.isPropertyAccessExpression(urlArg) && !isParameterDerived(urlArg)) {
          ts.forEachChild(node, (c) => walkNode(c, inExported));
          return;
        }
        ctx.reportAt(
          node,
          "Replace user-controlled URL in fetch() with literal URL or allowlist -- SSRF risk",
          {
            action: "use-literal-url",
            pattern: "Use string literal URL or validate against allowlist",
            reference: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html",
          }
        );
      }
      ts.forEachChild(node, (c) => walkNode(c, inExported));
    }
    walkNode(ctx.sourceFile, false);
  },
});
