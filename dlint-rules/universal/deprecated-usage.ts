// Flags usage of symbols annotated with @deprecated JSDoc tag.
// Catches call expressions, property accesses, and standalone identifiers; TypeScript's lib counts like any other code.
// Excludes self-references within the deprecated declaration itself.
import ts from "typescript";
import { defineRule, resolveSymbol, valueSymbolOf } from "@dfine-io-gmbh/dlint";

const deprecatedCache = new WeakMap<
  import("typescript").Symbol,
  string | null
>();

export default defineRule({
  meta: {
    category: "quality",
    description: "Usage of @deprecated symbols",
  },
  check(ctx) {
    function isDeprecated(node: ts.Identifier): string | null {
      const rawSymbol = valueSymbolOf(node, ctx.checker);
      const symbol = rawSymbol ? resolveSymbol(ctx.checker, rawSymbol) : null;
      if (!symbol) return null;
      const cached = deprecatedCache.get(symbol);
      if (cached !== undefined) return cached;
      // A reference cannot pick an overload: it is deprecated only when every declaration is
      const tags = (symbol.declarations ?? []).map((d) => ts.getJSDocDeprecatedTag(d));
      const tag = tags.length > 0 && tags.every((t) => t !== undefined) ? tags[0] : undefined;
      const result = tag ? ts.getTextOfJSDocComment(tag.comment) || "deprecated" : null;
      deprecatedCache.set(symbol, result);
      return result;
    }

    function isInOwnDeclaration(node: ts.Node): boolean {
      const nodeSymbol = ts.isIdentifier(node) ? valueSymbolOf(node, ctx.checker) : ctx.checker.getSymbolAtLocation(node);
      if (!nodeSymbol) return false;
      let parent = node.parent;
      while (parent) {
        if (
          (ts.isFunctionDeclaration(parent) ||
            ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isVariableDeclaration(parent)) &&
          parent.name &&
          ts.isIdentifier(parent.name)
        ) {
          if (ctx.checker.getSymbolAtLocation(parent.name) === nodeSymbol)
            return true;
        }
        parent = parent.parent;
      }
      return false;
    }

    function check(node: ts.Identifier, name: string): void {
      const reason = isDeprecated(node);
      // The deprecation test hits a per-symbol cache; the ancestor walk only runs for a deprecated hit
      if (reason && !isInOwnDeclaration(node)) {
        ctx.reportAt(
          node,
          `Replace deprecated '${name}'${reason !== "deprecated" ? `: ${reason}` : ""}`,
          {
            action: "replace-deprecated",
            pattern:
              "Use the recommended replacement from the deprecation notice",
          }
        );
      }
    }

    ctx.walk((node) => {
      if (ts.isCallExpression(node)) {
        const sig = ctx.checker.getResolvedSignature(node);
        const decl = sig?.getDeclaration();
        if (!decl) return;
        const depTag = ts.getJSDocDeprecatedTag(decl);
        if (!depTag) return;
        const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
        // A call node has no symbol: test the callee, so a deprecated function may call itself
        if (isInOwnDeclaration(callee)) return;
        const name = ts.isIdentifier(callee) || ts.isPrivateIdentifier(callee) ? callee.text : "call";
        const reason = ts.getTextOfJSDocComment(depTag.comment) || "deprecated";
        ctx.reportAt(node, `Replace deprecated '${name}'${reason !== "deprecated" ? `: ${reason}` : ""}`, {
          action: "replace-deprecated",
          pattern: "Use the recommended replacement from the deprecation notice",
        });
        return;
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        if (ts.isCallExpression(node.parent) && node.parent.expression === node) return;
        check(node.name, node.name.text);
      }
      if (
        ts.isIdentifier(node) &&
        // The branches above cover a callee and a member name; an argument or a receiver is checked here
        !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !ts.isPropertyDeclaration(node.parent) &&
        !ts.isMethodDeclaration(node.parent) &&
        !ts.isFunctionDeclaration(node.parent) &&
        !ts.isImportSpecifier(node.parent) &&
        !ts.isParameter(node.parent)
      ) {
        check(node, node.text);
      }
    });
  },
});
