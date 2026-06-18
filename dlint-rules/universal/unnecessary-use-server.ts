// Flags "use server" files where no export is transitively reachable from a "use client" file.
// Unnecessary "use server" exposes internal functions as public RPC endpoints.
// Reverse-import index built once per Program (memoized) → O(N·fileSize) instead of O(S·N·fileSize).
import ts from "typescript";
import { defineRule, hasDirective } from "@dfine-io-gmbh/dlint";

type ReverseIndex = { importers: Map<string, string[]>; clientReach: Map<string, boolean> };
const indexCache = new WeakMap<ts.Program, ReverseIndex>();

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) return bindings.elements.every((el) => el.isTypeOnly);
  return false;
}

// All value-import specifiers (static + dynamic import()) of a file.
function collectImportSpecifiers(sf: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyImport(node)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) specifiers.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specifiers;
}

// Build "who imports file X" once per Program (reverse of the import graph).
function buildReverseIndex(program: ts.Program): ReverseIndex {
  const importers = new Map<string, string[]>();
  const opts = program.getCompilerOptions();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || program.isSourceFileFromExternalLibrary(sf)) continue;
    for (const specifier of collectImportSpecifiers(sf)) {
      const resolved = ts.resolveModuleName(specifier, sf.fileName, opts, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) continue;
      const list = importers.get(resolved) ?? [];
      list.push(sf.fileName);
      importers.set(resolved, list);
    }
  }
  return { importers, clientReach: new Map() };
}

function getIndex(program: ts.Program): ReverseIndex {
  let index = indexCache.get(program);
  if (!index) {
    index = buildReverseIndex(program);
    indexCache.set(program, index);
  }
  return index;
}

// Memoized: file is client-reachable if it (or any transitive importer) is a "use client" file.
function isClientReachable(program: ts.Program, index: ReverseIndex, fileName: string, stack: Set<string>): boolean {
  const cached = index.clientReach.get(fileName);
  if (cached !== undefined) return cached;
  if (stack.has(fileName)) return false;
  const sf = program.getSourceFile(fileName);
  if (!sf) { index.clientReach.set(fileName, false); return false; }
  if (hasDirective(sf, "use client")) { index.clientReach.set(fileName, true); return true; }
  stack.add(fileName);
  let reachable = false;
  for (const importer of index.importers.get(fileName) ?? []) {
    if (isClientReachable(program, index, importer, stack)) { reachable = true; break; }
  }
  stack.delete(fileName);
  index.clientReach.set(fileName, reachable);
  return reachable;
}

export default defineRule({
  meta: {
    category: "security",
    description: "Unnecessary use server — no transitive client callers",
  },
  check(ctx) {
    if (!hasDirective(ctx.sourceFile, "use server")) return;
    const modSym = ctx.checker.getSymbolAtLocation(ctx.sourceFile);
    if (!modSym) return;
    const fnExports = ctx.checker
      .getExportsOfModule(modSym)
      .filter((e) => e.declarations?.some((d) => ts.isFunctionDeclaration(d) || ts.isVariableDeclaration(d)));
    if (fnExports.length === 0) return;

    const index = getIndex(ctx.program);
    if (isClientReachable(ctx.program, index, ctx.sourceFile.fileName, new Set())) return;

    // No client chain: a non-client/non-server importer is an RSC prop-passing violation; else dead directive.
    let rscImporter: string | null = null;
    for (const importer of index.importers.get(ctx.sourceFile.fileName) ?? []) {
      const sf = ctx.program.getSourceFile(importer);
      if (!sf || hasDirective(sf, "use client") || hasDirective(sf, "use server")) continue;
      rscImporter = importer.replace(/^.*\//, "");
      break;
    }

    const firstStmt = ctx.sourceFile.statements[0];
    if (!firstStmt) return;
    if (rscImporter) {
      ctx.reportAt(
        firstStmt,
        `Move "use server" import from RSC (${rscImporter}) to "use client" file -- no client caller in chain`,
        {
          action: "fix-import-chain",
          pattern: 'Client Component must import Server Action directly -> move import from RSC to "use client" file',
        },
      );
    } else {
      ctx.reportAt(
        firstStmt,
        `Remove "use server" directive or move functions to utils -- no client callers found`,
        { action: "remove-directive", pattern: 'Remove "use server" or move functions to lib/utils/' },
      );
    }
  },
});
