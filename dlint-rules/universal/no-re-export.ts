// Flags re-exports: export { X } from "...", export type { X }, export * from.
// Re-exports create indirection — callers should import directly from the source.
// Detects: with module specifier (all forms) + without specifier (imported then re-exported).
// TypeChecker used only for local re-export detection (resolve symbol to import origin).
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No re-exports: import directly from the source module",
  },
  check(ctx) {
    const sf = ctx.sourceFile;
    if (sf.isDeclarationFile) return;

    for (const stmt of sf.statements) {
      if (!ts.isExportDeclaration(stmt)) continue;

      // Case 1: export { X } from "./module" - has moduleSpecifier
      if (stmt.moduleSpecifier) {
        const specifier = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : "";

        if (!stmt.exportClause) {
          ctx.reportAt(stmt, `Barrel re-export from "${specifier}" - import directly from source`, {
            action: "remove-re-export",
            pattern: "Import directly from the source module, remove barrel",
          });
          continue;
        }

        if (ts.isNamedExports(stmt.exportClause)) {
          for (const spec of stmt.exportClause.elements) {
            ctx.reportAt(spec, `Re-export '${spec.name.text}' from "${specifier}" - import directly from source`, {
              action: "remove-re-export",
              pattern: "Import directly from the source module",
            });
          }
        }

        if (ts.isNamespaceExport(stmt.exportClause)) {
          ctx.reportAt(stmt, `Namespace re-export '${stmt.exportClause.name.text}' from "${specifier}" - import directly`, {
            action: "remove-re-export",
            pattern: "Import directly from the source module",
          });
        }
        continue;
      }

      // Case 2: export { X } or export type { X } - no moduleSpecifier
      // Detect if X was imported (re-export of import)
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const spec of stmt.exportClause.elements) {
          const sym = ctx.checker.getSymbolAtLocation(spec.name);
          if (!sym) continue;
          const resolved = sym.flags & ts.SymbolFlags.Alias
            ? ctx.checker.getAliasedSymbol(sym)
            : sym;
          const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
          if (!decl) continue;
          if (decl.getSourceFile() !== sf) {
            ctx.reportAt(spec, `Re-export '${spec.name.text}' - imported then re-exported, import directly from source`, {
              action: "remove-re-export",
              pattern: "Import directly from the source module",
            });
          }
        }
      }
    }
  },
});
