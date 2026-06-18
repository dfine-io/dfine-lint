// Builds cross-file reference index via TypeChecker symbol resolution.
// Phase 1: reverse-map each exported symbol -> [{fileName, exportName}].
// Phase 2: walk all identifiers, resolve to symbols, record all export sites.
// Handles re-exports: one symbol exported from multiple files all get credit.
// Dynamic imports: resolves module specifier, marks all exports as referenced.
// Consumed by rules via ctx.referenceIndex for dead export detection.
import ts from "typescript";
import type { ReferenceIndex } from "../types.js";

function addRef(index: Map<string, Set<string>>, fileName: string, name: string): void {
  let refs = index.get(fileName);
  if (!refs) { refs = new Set(); index.set(fileName, refs); }
  refs.add(name);
}

export function buildReferenceIndex(
  program: ts.Program,
  checker: ts.TypeChecker
): ReferenceIndex {
  const index = new Map<string, Set<string>>();

  // Phase 1: Build reverse map — resolved symbol → all {fileName, exportName} pairs
  // A symbol re-exported from N files appears N times in the array.
  const symbolToExports = new Map<ts.Symbol, { fileName: string; name: string }[]>();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    const moduleSym = checker.getSymbolAtLocation(sf);
    if (!moduleSym) continue;
    for (const exp of checker.getExportsOfModule(moduleSym)) {
      const resolved = exp.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exp)
        : exp;
      let entries = symbolToExports.get(resolved);
      if (!entries) { entries = []; symbolToExports.set(resolved, entries); }
      entries.push({ fileName: sf.fileName, name: exp.name });
    }
  }

  // Phase 2: Walk all identifiers, resolve to symbols, mark all export sites
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    function walk(node: ts.Node): void {
      if (ts.isIdentifier(node)) {
        const sym = checker.getSymbolAtLocation(node);
        if (sym) {
          const resolved = sym.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(sym)
            : sym;
          const entries = symbolToExports.get(resolved);
          if (entries) {
            for (const { fileName, name } of entries) {
              if (fileName !== sf.fileName) addRef(index, fileName, name);
            }
          }
        }
      }
      // Dynamic imports: import('./module') — mark all exports as referenced
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length === 1) {
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteral(specifier)) {
          const moduleSym = checker.getSymbolAtLocation(specifier);
          if (moduleSym) {
            const decl = moduleSym.valueDeclaration ?? moduleSym.declarations?.[0];
            if (decl && !decl.getSourceFile().fileName.includes("node_modules")) {
              const fileName = decl.getSourceFile().fileName;
              for (const exp of checker.getExportsOfModule(moduleSym)) addRef(index, fileName, exp.name);
            }
          }
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(sf);
  }

  return index;
}
