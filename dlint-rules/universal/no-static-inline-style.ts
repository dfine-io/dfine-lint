// Prevents static style={{}} objects in JSX — use CSS Module classes instead.
// Only flags style objects where ALL values are static literals (string, number).
// Dynamic style values (computed at runtime) are intentionally allowed.
// Enforces CSS Module classes over static inline style objects.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function isStaticValue(node: ts.Expression): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))
  );
}

function allPropertiesStatic(obj: ts.ObjectLiteralExpression): boolean {
  if (obj.properties.length === 0) return true;
  return obj.properties.every((prop) => {
    if (ts.isPropertyAssignment(prop)) {
      return isStaticValue(prop.initializer);
    }
    return false;
  });
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No inline style={{}} with static values",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    ctx.walk((node) => {
      if (
        ts.isJsxAttribute(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "style" &&
        node.initializer
      ) {
        if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isObjectLiteralExpression(node.initializer.expression)
        ) {
          if (allPropertiesStatic(node.initializer.expression)) {
            ctx.reportAt(
              node,
              "Replace inline style={{}} with CSS Module class - all values are static",
              {
                action: "use-css-module",
                pattern:
                  "Use CSS Module class - className={styles.myClass} in app/styles/*.module.css",
              }
            );
          }
        }
      }
    });
  },
});
