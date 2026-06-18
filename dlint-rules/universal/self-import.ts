// Flags files that import themselves (circular self-reference).
// Resolves import specifiers via ts.resolveModuleName to detect aliased self-imports.
// Self-imports cause initialization bugs and indicate broken module structure.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "architecture",
    description: "File imports itself",
  },
  check(ctx) {
    ts.forEachChild(ctx.sourceFile, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const resolved = ts.resolveModuleName(
          node.moduleSpecifier.text,
          ctx.sourceFile.fileName,
          ctx.program.getCompilerOptions(),
          ts.sys
        );
        if (
          resolved.resolvedModule?.resolvedFileName === ctx.sourceFile.fileName
        ) {
          ctx.reportAt(
            node,
            `File imports itself via '${node.moduleSpecifier.text}'`,
            {
              action: "remove-self-import",
              pattern: "Delete the self-import, use local declarations directly",
              fix: ctx.deleteNode(node),
            }
          );
        }
      }
    });
  },
});
