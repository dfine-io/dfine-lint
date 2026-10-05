// Flags two imports of one module: the same file, or ambient modules with one export set (fs, node:fs).
// Type-only and value imports group apart, so an import type beside value imports is no duplicate.
import ts from "typescript";
import { defineRule, isTypeOnlyImport, resolveImportedModule, resolveSymbol } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "architecture",
    description: "Duplicate imports from the same module",
  },
  check(ctx) {
    type ImportEntry = ts.ImportDeclaration & {
      readonly moduleSpecifier: ts.StringLiteral;
    };
    const imports = new Map<string, ImportEntry[]>();
    const options = ctx.program.getCompilerOptions();
    const typeOnly = (d: ImportEntry): boolean => isTypeOnlyImport(d, options);
    // A builtin has no file: "fs" and "node:fs" are two module symbols with one export set.
    // One wildcard symbol ("*.css") stands for many files, so equal sets only merge distinct symbols.
    const ambient: { module: ts.Symbol; exports: ReadonlySet<ts.Symbol>; key: string }[] = [];
    const moduleKey = (specifier: ts.StringLiteral): string => {
      const file = resolveImportedModule(ctx.program, specifier)?.resolvedFileName;
      if (file) return file;
      const module = ctx.checker.getSymbolAtLocation(specifier);
      if (!module) return specifier.text;
      const exports = new Set(ctx.checker.getExportsOfModule(module).map((s) => resolveSymbol(ctx.checker, s)));
      const same = exports.size > 0
        ? ambient.find((a) => a.module !== module && a.exports.size === exports.size && [...exports].every((s) => a.exports.has(s)))
        : undefined;
      const key = same?.key ?? specifier.text;
      ambient.push({ module, exports, key });
      return key;
    };

    ts.forEachChild(ctx.sourceFile, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const entry = node as ImportEntry;
        const key = moduleKey(entry.moduleSpecifier) + (typeOnly(entry) ? "\0type" : "");
        const existing = imports.get(key);
        if (existing) existing.push(entry);
        else imports.set(key, [entry]);
      }
    });

    for (const [, decls] of imports) {
      if (decls.length < 2) continue;
      // Skip TS 1363: all type-only with default + named bindings (unmergeable)
      if (decls.every(typeOnly)) {
        const hasDefault = decls.some((d) => !!d.importClause?.name);
        const hasNamed = decls.some((d) => {
          const b = d.importClause?.namedBindings;
          return b !== undefined && ts.isNamedImports(b);
        });
        if (hasDefault && hasNamed) continue;
      }

      // Auto-fix only the all-named-imports case: union every specifier into the first
      // declaration and delete the rest. Default/namespace/side-effect imports stay advisory.
      const sf = ctx.sourceFile;
      const allNamed = decls.every((d) => {
        const ic = d.importClause;
        const nb = ic?.namedBindings;
        return !!ic && !ic.name && !!nb && ts.isNamedImports(nb);
      });
      let mergeFix: { start: number; length: number; newText: string }[] | undefined;
      const first = decls[0];
      const firstNb = first?.importClause?.namedBindings;
      if (allNamed && first && firstNb && ts.isNamedImports(firstNb)) {
        const specs: string[] = [];
        const seen = new Set<string>();
        for (const d of decls) {
          const nb = d.importClause?.namedBindings;
          if (nb && ts.isNamedImports(nb)) {
            for (const el of nb.elements) {
              const t = el.getText(sf);
              if (!seen.has(t)) { seen.add(t); specs.push(t); }
            }
          }
        }
        mergeFix = [
          ctx.createFix(firstNb, `{ ${specs.join(", ")} }`),
          ...decls.slice(1).map((d) => ctx.deleteNode(d)),
        ];
      }

      for (let i = 1; i < decls.length; i++) {
        const decl = decls[i];
        if (!decl) continue;
        ctx.reportAt(
          decl,
          `Duplicate import from '${decl.moduleSpecifier.text}' — merge into single import statement`,
          {
            action: "merge-imports",
            pattern: "Merge all specifiers into one import from the module",
            reference: "https://www.typescriptlang.org/docs/handbook/modules/reference.html",
            ...(i === 1 && mergeFix ? { fix: mergeFix } : {}),
          }
        );
      }
    }
  },
});
