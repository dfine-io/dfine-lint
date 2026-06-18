// Verifies that styles.className accesses reference classes that exist in the CSS Module.
// Catches typos and stale references after CSS refactoring.
// Uses TypeChecker to extract class names from the styles import type (requires typed CSS Modules).
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function getCssClassesFromType(
  styleId: ts.Identifier,
  checker: ts.TypeChecker,
): Set<string> | null {
  const type = checker.getTypeAtLocation(styleId);
  const indexInfos = checker.getIndexInfosOfType(type);
  const props = type.getProperties();
  if (indexInfos.length > 0 && props.length === 0) {
    return null; // Generic { [key: string]: string } — cannot validate class names
  }
  return new Set(props.map(p => p.name));
}

export default defineRule({
  meta: {
    category: "quality",
    description: "CSS class existence in imported .module.css",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    const styleImports = new Set<string>();

    for (const stmt of ctx.sourceFile.statements) {
      if (
        ts.isImportDeclaration(stmt) &&
        ts.isStringLiteral(stmt.moduleSpecifier) &&
        stmt.moduleSpecifier.text.endsWith(".module.css") &&
        stmt.importClause?.name
      ) {
        styleImports.add(stmt.importClause.name.text);
      }
    }

    if (styleImports.size === 0) return;

    ctx.walk((node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        styleImports.has(node.expression.text)
      ) {
        const classes = getCssClassesFromType(node.expression, ctx.checker);
        if (!classes) return; // Generic type — skip validation
        const className = node.name.text;

        if (classes.size > 0 && !classes.has(className)) {
          ctx.reportAt(
            node,
            `Remove reference to non-existent CSS class '${className}' - not found in ${node.expression.text} module`,
            {
              action: "fix-class-name",
              pattern: "Use an existing class from the .module.css file",
            }
          );
        }
      }
    });
  },
});
