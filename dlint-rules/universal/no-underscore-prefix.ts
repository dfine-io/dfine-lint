// Detects underscore-prefixed identifiers in declarations via TypeChecker symbol resolution.
// Underscore prefixes are backwards-compat hacks or unused markers — use semantic names
// or single '_' for intentional discard. Property assignments exempt when contextual type constrains the name.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

const UNDERSCORE_CHAR_CODE = 95;

function hasUnderscorePrefix(symbol: ts.Symbol): boolean {
  const symbolName = symbol.getName();
  return symbolName.length >= 2 && symbolName.charCodeAt(0) === UNDERSCORE_CHAR_CODE;
}

function isPropertyConstrainedByContextualType(
  node: ts.PropertyAssignment | ts.ShorthandPropertyAssignment,
  checker: ts.TypeChecker,
): boolean {
  const objectLiteral = node.parent;
  if (!ts.isObjectLiteralExpression(objectLiteral)) return false;
  const propertyName = node.name;
  if (!ts.isIdentifier(propertyName)) return false;
  let contextualType = checker.getContextualType(objectLiteral);
  // Fallback: object literal inside JsxExpression — resolve type via JSX attribute symbol
  if (
    !contextualType &&
    ts.isJsxExpression(objectLiteral.parent) &&
    ts.isJsxAttribute(objectLiteral.parent.parent) &&
    ts.isIdentifier(objectLiteral.parent.parent.name)
  ) {
    const attrSymbol = checker.getSymbolAtLocation(objectLiteral.parent.parent.name);
    if (attrSymbol) {
      contextualType = checker.getTypeOfSymbolAtLocation(attrSymbol, objectLiteral.parent.parent);
    }
  }
  if (!contextualType) return false;
  const property = contextualType.getProperty(propertyName.text);
  if (property) return true;
  // Handle optional/union types: unwrap nullable members
  if (contextualType.isUnion()) {
    return contextualType.types.some((t) => t.getProperty(propertyName.text) !== undefined);
  }
  return false;
}

function reportUnderscorePrefix(
  ctx: Parameters<Parameters<typeof defineRule>[0]["check"]>[0],
  identifier: ts.Identifier,
  symbolName: string,
): void {
  const stripped = symbolName.slice(1);
  ctx.reportAt(identifier, `Remove underscore prefix from '${symbolName}' - use '${stripped}' or '_' for discard`, {
    action: "rename-identifier",
    pattern: `Rename '${symbolName}' to '${stripped}', or use single '_' if intentionally unused`,
    reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#variables",
  });
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No underscore-prefixed identifiers — use semantic names or '_' discard",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
        return;
      }

      if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
        return;
      }

      if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
        return;
      }

      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        if (isPropertyConstrainedByContextualType(node, ctx.checker)) return;
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
        return;
      }

      if (ts.isShorthandPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        if (isPropertyConstrainedByContextualType(node, ctx.checker)) return;
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
        return;
      }

      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        const symbol = ctx.checker.getSymbolAtLocation(node.name);
        if (symbol && hasUnderscorePrefix(symbol)) {
          reportUnderscorePrefix(ctx, node.name, symbol.getName());
        }
      }
    });
  },
});
