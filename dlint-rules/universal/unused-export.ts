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

      // Auto-fix: drop the `export` keyword on a named declaration (never `export default`,
      // never a re-export) -- turns the dead public API into a local, references intact.
      const modHost = ts.isVariableDeclaration(decl) ? decl.parent?.parent : decl;
      const mods = modHost && ts.canHaveModifiers(modHost) ? ts.getModifiers(modHost) : undefined;
      const exportKw = mods?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
      const exportFix =
        exportKw && !isDefault
          ? { start: exportKw.getStart(sf), length: exportKw.getWidth(sf) + 1, newText: "" }
          : undefined;

      ctx.reportAt(nameNode, `Remove unused export '${exp.name}' -- no cross-file references`, {
        action: "remove-unused-export",
        pattern: "Remove the export keyword - delete the declaration if nothing in-file uses it",
        reference: "https://www.typescriptlang.org/docs/handbook/modules/reference.html",
        ...(exportFix ? { fix: exportFix } : {}),
      });
    }
  },
});
