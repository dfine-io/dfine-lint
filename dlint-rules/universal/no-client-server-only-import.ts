// Flags client-reachable modules that import server-only modules (value, not type-only).
// Walks each "use client" file's value-import closure, stopping at "use server" bridges.
// A chain ending at `import "server-only"` or a server-only package (db/SDK/node-builtin) is a violation.
import ts from "typescript";
import { relative } from "node:path";
import { builtinModules } from "node:module";
import { defineRule, hasDirective } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
// Deterministic server-only roots — no curated package list:
//   1. The `server-only` marker package (explicit boundary declaration, SSOT).
//   2. `next/headers` / `next/cache` (Next's own server-only APIs).
//   3. Node builtins — derived from Node's own `builtinModules`, the runtime definition itself.
// External SDKs (stripe/@aws-sdk/@clerk-server/@upstash) carry no marker and expose only types,
// so no static tool can auto-detect them — they must sit behind a `server-only`-marked wrapper.
const NEXT_SERVER_APIS = new Set(["server-only", "next/headers", "next/cache"]);
// ===========================================================================

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m: string) => `node:${m}`)]);

type ChainResult = readonly string[] | null;
const reachCache = new WeakMap<ts.Program, Map<string, ChainResult>>();
const importCache = new WeakMap<ts.Program, Map<string, readonly ImportEdge[]>>();

type ImportEdge = { specifier: string; node: ts.Node };

function isServerOnlyRoot(specifier: string, nextServerApis: Set<string>): boolean {
  return nextServerApis.has(specifier) || NODE_BUILTINS.has(specifier);
}

// True when the import declaration pulls no runtime value (fully type-only, erased at compile time).
function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) return bindings.elements.every((el) => el.isTypeOnly);
  return false;
}

function collectValueImports(program: ts.Program, sf: ts.SourceFile): readonly ImportEdge[] {
  let perProgram = importCache.get(program);
  if (!perProgram) {
    perProgram = new Map();
    importCache.set(program, perProgram);
  }
  const cached = perProgram.get(sf.fileName);
  if (cached) return cached;
  const edges: ImportEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyImport(node)) {
      edges.push({ specifier: node.moduleSpecifier.text, node });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) edges.push({ specifier: arg.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  perProgram.set(sf.fileName, edges);
  return edges;
}

function resolveFile(program: ts.Program, specifier: string, fromFile: string): string | null {
  const resolved = ts.resolveModuleName(specifier, fromFile, program.getCompilerOptions(), ts.sys);
  return resolved.resolvedModule?.resolvedFileName ?? null;
}

// DFS: does `filePath` (transitively, via value imports) reach a server-only source?
// Returns the chain of files to the server-only source, or null. "use server" files stop the walk (RPC bridge).
function reachesServerOnly(program: ts.Program, filePath: string, stack: Set<string>, nextServerApis: Set<string>): ChainResult {
  let memo = reachCache.get(program);
  if (!memo) {
    memo = new Map();
    reachCache.set(program, memo);
  }
  if (memo.has(filePath)) return memo.get(filePath) ?? null;
  if (stack.has(filePath)) return null;

  const sf = program.getSourceFile(filePath);
  if (!sf || sf.isDeclarationFile || program.isSourceFileFromExternalLibrary(sf)) {
    memo.set(filePath, null);
    return null;
  }
  if (hasDirective(sf, "use server")) {
    memo.set(filePath, null);
    return null;
  }

  stack.add(filePath);
  for (const { specifier } of collectValueImports(program, sf)) {
    if (isServerOnlyRoot(specifier, nextServerApis)) {
      stack.delete(filePath);
      const chain = [filePath];
      memo.set(filePath, chain);
      return chain;
    }
    const target = resolveFile(program, specifier, filePath);
    if (!target) continue;
    const sub = reachesServerOnly(program, target, stack, nextServerApis);
    if (sub) {
      stack.delete(filePath);
      const chain = [filePath, ...sub];
      memo.set(filePath, chain);
      return chain;
    }
  }
  stack.delete(filePath);
  memo.set(filePath, null);
  return null;
}

function formatChain(root: string, chain: readonly string[], cwd: string): string {
  return [root, ...chain].map((f) => relative(cwd, f)).join(" → ");
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Client modules must not reach server-only modules (value imports)",
  },
  check(ctx) {
    if (!hasDirective(ctx.sourceFile, "use client")) return;
    const nextServerApis = ctx.options.nextServerApis ? new Set(ctx.options.nextServerApis as string[]) : NEXT_SERVER_APIS;
    const cwd = ctx.program.getCurrentDirectory();
    const fromFile = ctx.sourceFile.fileName;

    for (const { specifier, node } of collectValueImports(ctx.program, ctx.sourceFile)) {
      if (isServerOnlyRoot(specifier, nextServerApis)) {
        ctx.reportAt(node, `Client component imports server-only resource "${specifier}" — move behind a Server Action`, {
          action: "move-behind-server-action",
          pattern: "Call the server resource from a Server Action ('use server'); client invokes the action.",
        });
        continue;
      }
      const target = resolveFile(ctx.program, specifier, fromFile);
      if (!target) continue;
      const chain = reachesServerOnly(ctx.program, target, new Set(), nextServerApis);
      if (chain) {
        ctx.reportAt(node, `Client reaches server-only module via: ${formatChain(fromFile, chain, cwd)} — split the module or route through a Server Action`, {
          action: "split-or-bridge",
          pattern: "Move the server-only part behind 'use server' / a server-only sibling; keep the pure part client-safe.",
        });
      }
    }
  },
});
