// Flags usage of symbols annotated with @deprecated JSDoc tag.
// Catches call expressions, property accesses, and standalone identifiers.
// Excludes self-references within the deprecated declaration itself.
import ts from "typescript";
import { defineRule, isLibDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

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
    function isDeprecated(node: ts.Node): string | null {
      const rawSymbol = ctx.checker.getSymbolAtLocation(node);
      const symbol = rawSymbol ? resolveSymbol(ctx.checker, rawSymbol) : null;
      if (!symbol) return null;
      const cached = deprecatedCache.get(symbol);
      if (cached !== undefined) return cached;
      if (isLibDeclaration(symbol)) {
        deprecatedCache.set(symbol, null);
        return null;
      }
      const tag = symbol
        .getJsDocTags(ctx.checker)
        .find((t) => t.name === "deprecated");
      const result = tag
        ? ts.displayPartsToString(tag.text) || "deprecated"
        : null;
      deprecatedCache.set(symbol, result);
      return result;
    }

    function isInOwnDeclaration(node: ts.Node): boolean {
      const nodeSymbol = ctx.checker.getSymbolAtLocation(node);
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

    function check(node: ts.Node, name: string): void {
      if (isInOwnDeclaration(node)) return;
      const reason = isDeprecated(node);
      if (reason) {
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
        if (isInOwnDeclaration(node)) return;
        const sig = ctx.checker.getResolvedSignature(node);
        const decl = sig?.getDeclaration();
        if (!decl) return;
        const depTag = ts.getJSDocDeprecatedTag(decl);
        if (!depTag) return;
        const name = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ts.isIdentifier(node.expression)
            ? node.expression.text
            : "call";
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
        !ts.isCallExpression(node.parent) &&
        !ts.isPropertyAccessExpression(node.parent) &&
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
