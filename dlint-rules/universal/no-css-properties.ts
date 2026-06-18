// Prevents CSSProperties type annotations in components — use CSS Module classes.
// Flags both `const x: CSSProperties` and `satisfies CSSProperties` patterns.
// Enforces CSS Module classes over inline style objects.
import ts from "typescript";
import { defineRule, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

/** TypeChecker: resolved type name is CSSProperties from React */
function isCSSPropertiesType(typeNode: ts.TypeNode, checker: ts.TypeChecker): boolean {
  const type = checker.getTypeAtLocation(typeNode);
  const sym = type.getSymbol() ?? type.aliasSymbol;
  if (!sym) return false;
  const resolved = resolveSymbol(checker, sym);
  return resolved.name === "CSSProperties" && isNodeModulesDeclaration(resolved);
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No CSSProperties type annotation — use CSS Module classes",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    ctx.walk((node) => {
      // const styles: CSSProperties = { ... }
      if (
        ts.isVariableDeclaration(node) &&
        node.type &&
        ts.isTypeReferenceNode(node.type) &&
        isCSSPropertiesType(node.type, ctx.checker)
      ) {
        ctx.reportAt(
          node.type,
          "Replace CSSProperties variable with CSS Module class",
          {
            action: "use-css-module",
            pattern: "Use CSS Module class - className={styles.myClass} in *.module.css",
          }
        );
      }

      // { ... } satisfies CSSProperties
      if (
        ts.isSatisfiesExpression(node) &&
        ts.isTypeReferenceNode(node.type) &&
        isCSSPropertiesType(node.type, ctx.checker)
      ) {
        ctx.reportAt(
          node.type,
          "Replace satisfies CSSProperties with CSS Module class",
          {
            action: "use-css-module",
            pattern: "Use CSS Module class - className={styles.myClass} in *.module.css",
          }
        );
      }
    });
  },
});
