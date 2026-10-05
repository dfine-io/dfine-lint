// Detects functions with type-equivalent signatures and similar bodies across files.
// Type comparison via isTypeAssignableTo — no string losiness, branded types distinguished.
// Severity: warning — structural hints for consolidation, not build-breakers.
import ts from "typescript";
import {
  defineRule,
  getExportedFunctions,
  isProjectSourceFile,
  tokenizeFile,
  tokenBagSimilarity,
  type TokenizedBlock,
} from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_SEMANTIC_SIMILARITY = 0.80;
const MIN_SYNTACTIC_THRESHOLD = 0.92;
const MIN_PARAMS = 1;
const MIN_STATEMENTS = 5;
const MIN_LENGTH_RATIO = 0.4;
const MIN_ROUTE_DISTANCE = 2;
// ===========================================================================

interface FnEntry {
  file: string;
  name: string;
  paramTypes: ts.Type[];
  returnType: ts.Type;
  tokens: string[];
}

interface SemanticPair {
  aFile: string;
  aName: string;
  bFile: string;
  bName: string;
  similarity: number;
}

function areDifferentRoutes(fileA: string, fileB: string, minRouteDistance: number): boolean {
  const dirA = fileA.split("/").slice(0, -1);
  const dirB = fileB.split("/").slice(0, -1);
  let shared = 0;
  const minLen = Math.min(dirA.length, dirB.length);
  for (let i = 0; i < minLen; i++) {
    if (dirA[i] !== dirB[i]) break;
    shared++;
  }
  return dirA.length - shared >= minRouteDistance && dirB.length - shared >= minRouteDistance;
}

// A parameter that accepts anything (unknown, any, object, {} or only optional members) proves no shared contract
function isVacuousParam(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive)) return true;
  if (!(type.flags & ts.TypeFlags.Object)) return false;
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return false;
  if (!type.getProperties().every((p) => p.flags & ts.SymbolFlags.Optional)) return false;
  return checker.getIndexInfosOfType(type).every((info) => !!(info.type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)));
}

function signaturesMatch(a: FnEntry, b: FnEntry, checker: ts.TypeChecker): boolean {
  if (a.paramTypes.length !== b.paramTypes.length) return false;
  const vacuous = (t: ts.Type): boolean => isVacuousParam(t, checker);
  // Zero parameters prove nothing either way; only a non-empty all-vacuous list rejects the pair
  if (a.paramTypes.length > 0 && a.paramTypes.every(vacuous) && b.paramTypes.every(vacuous)) return false;
  for (let i = 0; i < a.paramTypes.length; i++) {
    const pa = a.paramTypes[i];
    const pb = b.paramTypes[i];
    if (!pa || !pb) return false;
    if (!checker.isTypeAssignableTo(pa, pb) ||
        !checker.isTypeAssignableTo(pb, pa)) return false;
  }
  return checker.isTypeAssignableTo(a.returnType, b.returnType) &&
         checker.isTypeAssignableTo(b.returnType, a.returnType);
}

const semanticPairsCache = new WeakMap<ts.Program, SemanticPair[]>();

function buildSemanticMap(
  program: ts.Program,
  checker: ts.TypeChecker,
  minSemanticSimilarity: number,
  minSyntacticThreshold: number,
  minParams: number,
  minStatements: number,
  minLengthRatio: number,
  minRouteDistance: number,
): SemanticPair[] {
  const entries: FnEntry[] = [];

  for (const sf of program.getSourceFiles()) {
    if (!isProjectSourceFile(sf)) continue;
    const blocks = tokenizeFile(sf);
    const blockMap = new Map<string, TokenizedBlock>();
    for (const block of blocks) blockMap.set(block.name, block);

    for (const fn of getExportedFunctions(sf, checker)) {
      const sym = checker.getSymbolAtLocation(fn.name);
      if (!sym) continue;
      const callSigs = checker.getTypeOfSymbol(sym).getCallSignatures();
      const sig = callSigs[0];
      if (!sig || sig.parameters.length < minParams) continue;
      const block = blockMap.get(fn.name.text);
      if (!block || block.stmtCount < minStatements) continue;
      entries.push({
        file: sf.fileName,
        name: fn.name.text,
        paramTypes: sig.parameters.map(p => checker.getTypeOfSymbol(p)),
        returnType: checker.getReturnTypeOfSignature(sig),
        tokens: block.tokens,
      });
    }
  }

  const pairs: SemanticPair[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (!a || !b) continue;
      if (a.file === b.file) continue;
      if (areDifferentRoutes(a.file, b.file, minRouteDistance)) continue;
      const shorter = Math.min(a.tokens.length, b.tokens.length);
      const longer = Math.max(a.tokens.length, b.tokens.length);
      if (shorter / longer < minLengthRatio) continue;
      // Multiset Jaccard never exceeds (shorter-1)/(longer-1) bigrams: pairs below the threshold skip the signature check
      if ((shorter - 1) / (longer - 1) < minSemanticSimilarity) continue;
      if (!signaturesMatch(a, b, checker)) continue;
      // The same measure as syntactic-clone; above the threshold syntactic-clone owns the pair if it has 10+ statements
      const sim = tokenBagSimilarity(a.tokens, b.tokens);
      if (sim < minSemanticSimilarity || sim >= minSyntacticThreshold) continue;
      pairs.push({ aFile: a.file, aName: a.name, bFile: b.file, bName: b.name, similarity: sim });
    }
  }
  return pairs;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Semantic clones: type-equivalent signature + >=80% body similarity",
  },
  check(ctx) {
    const minSemanticSimilarity = (ctx.options.minSemanticSimilarity as number) ?? MIN_SEMANTIC_SIMILARITY;
    const minSyntacticThreshold = (ctx.options.minSyntacticThreshold as number) ?? MIN_SYNTACTIC_THRESHOLD;
    const minParams = (ctx.options.minParams as number) ?? MIN_PARAMS;
    const minStatements = (ctx.options.minStatements as number) ?? MIN_STATEMENTS;
    const minLengthRatio = (ctx.options.minLengthRatio as number) ?? MIN_LENGTH_RATIO;
    const minRouteDistance = (ctx.options.minRouteDistance as number) ?? MIN_ROUTE_DISTANCE;

    let semanticPairs = semanticPairsCache.get(ctx.program);
    if (!semanticPairs) {
      semanticPairs = buildSemanticMap(
        ctx.program,
        ctx.checker,
        minSemanticSimilarity,
        minSyntacticThreshold,
        minParams,
        minStatements,
        minLengthRatio,
        minRouteDistance,
      );
      semanticPairsCache.set(ctx.program, semanticPairs);
    }

    const fileName = ctx.sourceFile.fileName;
    for (const pair of semanticPairs) {
      if (pair.aFile !== fileName && pair.bFile !== fileName) continue;
      const isLocal = pair.aFile === fileName;
      const localName = isLocal ? pair.aName : pair.bName;
      const remoteName = isLocal ? pair.bName : pair.aName;
      const remoteFile = isLocal ? pair.bFile : pair.aFile;
      const remoteShort = remoteFile.slice(remoteFile.lastIndexOf("/") + 1);
      const pct = Math.round(pair.similarity * 100);
      ctx.reportAt(
        ctx.sourceFile,
        `Consolidate ${localName} with ${remoteName} in ${remoteShort} -- type-equivalent signature, ${pct}% body similarity`,
        { action: "consolidate-functions", pattern: "Extract shared logic or delegate to one implementation" },
      );
    }
  },
});
