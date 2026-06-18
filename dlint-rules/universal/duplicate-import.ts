// Flags multiple import declarations resolving to the same physical file.
// Prevents import fragmentation that makes dependencies harder to track.
// Exempts mixed type-only/value imports that cannot be merged per TS rules.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

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
    const compilerOptions = ctx.program.getCompilerOptions();

    ts.forEachChild(ctx.sourceFile, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const entry = node as ImportEntry;
        const resolved = ts.resolveModuleName(
          entry.moduleSpecifier.text,
          ctx.sourceFile.fileName,
          compilerOptions,
          ts.sys
        );
        const key =
          resolved.resolvedModule?.resolvedFileName ??
          entry.moduleSpecifier.text;
        const existing = imports.get(key);
        if (existing) existing.push(entry);
        else imports.set(key, [entry]);
      }
    });

    for (const [, decls] of imports) {
      if (decls.length < 2) continue;
      // Check type-only at both declaration AND specifier level (TS 4.5+)
      const isFullyTypeOnly = (d: ImportEntry): boolean => {
        if (d.importClause?.isTypeOnly) return true;
        const bindings = d.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          return bindings.elements.length > 0 &&
            bindings.elements.every((el) => el.isTypeOnly);
        }
        return false;
      };
      // Skip mixed: some fully type-only + some with value imports
      if (decls.some(isFullyTypeOnly) && decls.some((d) => !isFullyTypeOnly(d)))
        continue;
      // Skip TS 1363: all type-only with default + named bindings (unmergeable)
      if (decls.every(isFullyTypeOnly)) {
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
          ...decls.slice(1).map((d) => ({
            start: d.getStart(sf),
            length: d.getWidth(sf) + 1,
            newText: "",
          })),
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
