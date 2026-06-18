// Detects duplicate code across the program via token-based similarity.
// Syntactic clones: >=92% token match with >=10 statements across different files.
// Cross-file only, not cross-route — prevents unintended code duplication.
// TypeChecker receiver-type filter eliminates cross-domain false positives.
import ts from "typescript";
import {
  defineRule,
  tokenizeFile,
  tokenSimilarity,
  type TokenizedBlock,
} from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_CLONE_SIMILARITY = 0.92;
// Floor 10 (not 12): genuine cross-file logic duplicates often have a counterpart just under 12
// statements, while floors <=9 flood false positives from mandatory boilerplate preambles — e.g. a
// framework-required auth -> rate-limit -> validate sequence of ~6-9 identical statements per handler
// that must NOT be extracted. At floor 10 only real multi-statement duplicates survive.
const MIN_STATEMENTS = 10;
// ===========================================================================

interface ClonePair {
  a: TokenizedBlock;
  b: TokenizedBlock;
  similarity: number;
}

function areDifferentRoutes(fileA: string, fileB: string): boolean {
  const dirA = fileA.split("/").slice(0, -1);
  const dirB = fileB.split("/").slice(0, -1);
  let shared = 0;
  const minLen = Math.min(dirA.length, dirB.length);
  for (let i = 0; i < minLen; i++) {
    if (dirA[i] !== dirB[i]) break;
    shared++;
  }
  return dirA.length - shared >= 2 && dirB.length - shared >= 2;
}

function collectReceiverSymbols(node: ts.Node, checker: ts.TypeChecker): Set<ts.Symbol> {
  const symbols = new Set<ts.Symbol>();
  function scan(n: ts.Node): void {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const sym = checker.getTypeAtLocation(n.expression.expression).getSymbol();
      if (sym) symbols.add(sym);
    }
    ts.forEachChild(n, scan);
  }
  scan(node);
  return symbols;
}

function sharesReceiverTypes(a: TokenizedBlock, b: TokenizedBlock, checker: ts.TypeChecker): boolean {
  const symsA = collectReceiverSymbols(a.node, checker);
  const symsB = collectReceiverSymbols(b.node, checker);
  if (symsA.size === 0 || symsB.size === 0) return true;
  for (const s of symsA) { if (symsB.has(s)) return true; }
  return false;
}

const clonePairsCache = new WeakMap<ts.Program, ClonePair[]>();

function buildCloneMap(program: ts.Program, minCloneSimilarity: number, minStatements: number): ClonePair[] {
  const allBlocks: TokenizedBlock[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    for (const block of tokenizeFile(sf)) {
      if (block.stmtCount >= minStatements) allBlocks.push(block);
    }
  }

  const pairs: ClonePair[] = [];
  for (let i = 0; i < allBlocks.length; i++) {
    for (let j = i + 1; j < allBlocks.length; j++) {
      const a = allBlocks[i];
      const b = allBlocks[j];
      if (!a || !b) continue;
      if (a.file === b.file) continue;
      if (areDifferentRoutes(a.file, b.file)) continue;
      const lenRatio = Math.min(a.tokens.length, b.tokens.length) / Math.max(a.tokens.length, b.tokens.length);
      if (lenRatio < 0.6) continue;
      const sim = tokenSimilarity(a.tokens, b.tokens);
      if (sim >= minCloneSimilarity) pairs.push({ a, b, similarity: sim });
    }
  }
  return pairs;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Syntactic clones: >=92% identical token sequences across files",
  },
  check(ctx) {
    const minCloneSimilarity = (ctx.options.minCloneSimilarity as number) ?? MIN_CLONE_SIMILARITY;
    const minStatements = (ctx.options.minStatements as number) ?? MIN_STATEMENTS;

    let clonePairs = clonePairsCache.get(ctx.program);
    if (!clonePairs) {
      clonePairs = buildCloneMap(ctx.program, minCloneSimilarity, minStatements);
      clonePairsCache.set(ctx.program, clonePairs);
    }

    const fileName = ctx.sourceFile.fileName;
    for (const pair of clonePairs) {
      const local = pair.a.file === fileName ? pair.a : pair.b.file === fileName ? pair.b : null;
      if (!local) continue;
      const remote = local === pair.a ? pair.b : pair.a;
      if (!sharesReceiverTypes(local, remote, ctx.checker)) continue;
      const pct = Math.round(pair.similarity * 100);
      const remoteShort = remote.file.slice(remote.file.lastIndexOf("/") + 1);
      ctx.reportAt(
        local.node,
        `Extract shared logic from ${local.name} (${local.stmtCount} stmts, ${pct}% similar to ${remote.name} in ${remoteShort}:${remote.line})`,
        { action: "extract-shared", pattern: "Extract shared logic to a common utility function" },
      );
    }
  },
});
