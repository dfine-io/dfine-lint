// Flags exported symbols with no cross-file references.
// Entry points (pages, routes, layouts) exempt via dlint.config.ts overrides.
// TypeChecker-based: uses ctx.referenceIndex built from program-wide symbol scan.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Unused export: no cross-file references",
  },
  check(ctx) {
    const sf = ctx.sourceFile;
    if (sf.isDeclarationFile) return;

    const sfSymbol = ctx.checker.getSymbolAtLocation(sf);
    if (!sfSymbol) return;

    const moduleExports = ctx.checker.getExportsOfModule(sfSymbol);
    const referenced = ctx.referenceIndex.get(sf.fileName);

    for (const exp of moduleExports) {
      if (referenced?.has(exp.name)) continue;

      const decl = exp.valueDeclaration ?? exp.declarations?.[0];
      if (!decl) continue;
      const nameNode = ts.isFunctionDeclaration(decl) && decl.name
        ? decl.name
        : ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)
          ? decl.name
          : decl;

      ctx.reportAt(nameNode, `Remove unused export '${exp.name}' -- no cross-file references`, {
        action: "remove-unused-export",
        pattern: "Remove the export keyword - delete the declaration if nothing in-file uses it",
        reference: "https://www.typescriptlang.org/docs/handbook/modules/reference.html",
      });
    }
  },
});
