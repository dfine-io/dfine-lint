// Flags performance antipatterns: regex in loops, array spread in accumulator,
// unbounded .map()/.filter() chains, and expensive operations in hot paths.
// These patterns cause O(n^2) or worse degradation at scale.
import ts from "typescript";
import { defineRule, isBuiltinCollection, isInsideLoop, isLibDeclaration, isNodeModulesDeclaration } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const SYNC_IO = new Set([
  "readFileSync", "writeFileSync", "appendFileSync", "mkdirSync",
  "rmdirSync", "unlinkSync", "renameSync", "copyFileSync",
  "statSync", "existsSync", "accessSync", "readdirSync",
]);
const MAX_CHAIN_DEPTH = 6;
// ===========================================================================

export default defineRule({
  meta: {
    category: "performance",
    description: "Regex-in-loop, sync-io, long-chain, array-mutation-in-callback, barrel-import",
    subChecks: 6,
  },
  check(ctx) {
    const offLongChain = ctx.isSubCheckDisabled("long-chain");
    const offBarrel = ctx.isSubCheckDisabled("no-barrel-import");
    const syncIo = ctx.options.syncIo ? new Set(ctx.options.syncIo as string[]) : SYNC_IO;
    const maxChainDepth = (ctx.options.maxChainDepth as number) ?? MAX_CHAIN_DEPTH;
    ctx.walk((node) => {
      // regex-in-loop: new RegExp() inside loop
      if (
        ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "RegExp" && isInsideLoop(node)
      ) {
        const regExpSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (regExpSym && isLibDeclaration(regExpSym)) {
          ctx.reportAt(node, "new RegExp() inside loop — hoist to constant", { action: "hoist-regex", pattern: "const RE = new RegExp(...); for (...) RE.test(...)" });
        }
      }

      // sync-io: readFileSync etc
      if (
        ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        syncIo.has(node.expression.text)
      ) {
        const syncSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (syncSym && isNodeModulesDeclaration(syncSym)) {
          ctx.reportAt(node, `${node.expression.text}() blocks event loop — use async variant`, { action: "use-async-io", pattern: "await readFile(path) instead of readFileSync(path)" });
        }
      }

      // long-chain: method chain depth > 6 (exempt third-party builder chains)
      if (!offLongChain && ts.isCallExpression(node)) {
        let depth = 0;
        let current: ts.Node = node;
        let isThirdPartyChain = false;
        while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
          depth++;
          if (!isThirdPartyChain) {
            const methodSym = ctx.checker.getSymbolAtLocation(current.expression.name);
            if (methodSym && isNodeModulesDeclaration(methodSym)) {
              isThirdPartyChain = true;
            }
          }
          current = current.expression.expression;
        }
        if (depth > maxChainDepth && !isThirdPartyChain) {
          ctx.reportAt(node, `Method chain depth ${depth} — break into variables`, { action: "break-chain", pattern: "const step1 = a.b(); const step2 = step1.c();" });
        }
      }

      // no-array-mutation-in-callback: .push() inside .map/.filter (exempt .reduce accumulator)
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      ) {
        const method = node.expression.name.text;
        if (method !== "push" && method !== "unshift" && method !== "splice") return;
        let current: ts.Node = node;
        while (current.parent) {
          if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
            const callParent = current.parent;
            if (ts.isCallExpression(callParent) && ts.isPropertyAccessExpression(callParent.expression)) {
              const cbMethod = callParent.expression.name.text;
              // Skip .reduce() — .push() on accumulator is the standard pattern
              if (cbMethod === "reduce") return;
              if (cbMethod === "map" || cbMethod === "filter") {
                const cbReceiverType = ctx.checker.getTypeAtLocation(callParent.expression.expression);
                if (ctx.checker.isArrayType(cbReceiverType) || ctx.checker.isTupleType(cbReceiverType)) {
                  ctx.reportAt(node, `Array .${method}() inside .${cbMethod}() — use immutable pattern`, { action: "use-immutable", pattern: "Use .reduce() or .flatMap() instead of .push() in callback" });
                }
              }
            }
            return;
          }
          current = current.parent;
        }
      }

      // no-array-delete: delete arr[i] creates sparse array
      if (ts.isDeleteExpression(node) && ts.isElementAccessExpression(node.expression)) {
        const targetType = ctx.checker.getTypeAtLocation(node.expression.expression);
        if (isBuiltinCollection(targetType, ctx.checker)) {
          ctx.reportAt(node, "delete on collection creates sparse hole — use .splice() or .delete()", { action: "use-splice", pattern: "arr.splice(i, 1) or set.delete(key)" });
        }
      }

      // no-barrel-import: import resolves to index file (TypeChecker-verified)
      if (
        !offBarrel && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        if (!spec.startsWith(".")) return;
        const resolved = ts.resolveModuleName(spec, ctx.sourceFile.fileName, ctx.program.getCompilerOptions(), ts.sys);
        const resolvedPath = resolved.resolvedModule?.resolvedFileName;
        if (resolvedPath && /[/\\]index\.[tj]sx?$/.test(resolvedPath)) {
          ctx.reportAt(node, "Barrel import — import directly from source file for tree-shaking", { action: "direct-import", pattern: "import { x } from './module' instead of './index'" });
        }
      }
    });
  },
});
