// Flags files that import or re-export themselves (circular self-reference).
// Resolves import specifiers the way the program does to detect aliased self-imports.
// Self-imports cause initialization bugs and indicate broken module structure.
import ts from "typescript";
import { defineRule, resolveImportedModule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "architecture",
    description: "File imports itself",
  },
  check(ctx) {
    ts.forEachChild(ctx.sourceFile, (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
        resolveImportedModule(ctx.program, node.moduleSpecifier)?.resolvedFileName === ctx.sourceFile.fileName
      ) {
        ctx.reportAt(node, `File imports itself via '${node.moduleSpecifier.text}'`, {
          action: "remove-self-import",
          pattern: "Delete the self-import, use local declarations directly",
          // Only a bare side-effect import binds no name, so only its removal cannot break a reference
          ...(ts.isImportDeclaration(node) && !node.importClause ? { fix: ctx.deleteNode(node) } : {}),
        });
      }
    });
  },
});
