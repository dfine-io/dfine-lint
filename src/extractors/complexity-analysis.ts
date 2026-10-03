import ts from "typescript";
import { defineExtractor } from "../helpers/define-extractor.js";
import { getExportedFunctions } from "../core/program.js";
import type { ExportedFunction } from "../core/program.js";
import type { ComplexityMetrics } from "../types.js";

const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.SwitchStatement, ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);

const LOGICAL_OPS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function analyzeFunction(
  node: ExportedFunction["func"], sf: ts.SourceFile
): Omit<ComplexityMetrics, "functionName" | "filePath"> {
  let cyclomaticComplexity = 1;
  let cognitiveComplexity = 0;
  let maxNestingDepth = 0;
  let branchCount = 0;
  let helperFunctionCount = 0;

  function walk(n: ts.Node, depth: number): void {
    if (BRANCH_KINDS.has(n.kind)) {
      cyclomaticComplexity++;
      branchCount++;
      cognitiveComplexity += depth + 1;
      if (depth + 1 > maxNestingDepth) maxNestingDepth = depth + 1;
    }
    if (ts.isBinaryExpression(n) && LOGICAL_OPS.has(n.operatorToken.kind)) {
      cyclomaticComplexity++;
    }
    const isNestedFn = (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n)) && n !== node;
    if (isNestedFn) helperFunctionCount++;
    ts.forEachChild(n, (child) => walk(child, BRANCH_KINDS.has(n.kind) ? depth + 1 : depth));
  }
  walk(node, 0);

  const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

  return {
    lineStart: startLine,
    lineCount: endLine - startLine + 1,
    cyclomaticComplexity,
    cognitiveComplexity,
    maxNestingDepth,
    parameterCount: node.parameters.length,
    helperFunctionCount,
    branchCount,
  };
}

export default defineExtractor<ComplexityMetrics>({
  id: "complexity-analysis",
  name: "Function Complexity Analyzer",
  extract(ctx) {
    const results: ComplexityMetrics[] = [];
    const exports = getExportedFunctions(ctx.sourceFile, ctx.checker);
    for (const fn of exports) {
      if (!fn.body) continue;
      results.push({
        functionName: fn.name.text,
        filePath: ctx.sourceFile.fileName,
        ...analyzeFunction(fn.func, ctx.sourceFile),
      });
    }
    return results;
  },
});
