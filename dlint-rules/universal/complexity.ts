// Flags functions exceeding complexity thresholds: cyclomatic, nesting depth,
// statement count, line count, parameter count, and callback depth.
// High complexity correlates with bugs and makes code harder to test and review.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MAX_DEPTH = 4;
const MAX_COMPLEXITY = 15;
const MAX_STATEMENTS = 25;
const MAX_LINES = 150;
const MAX_PARAMS = 4;
const MAX_CALLBACKS = 3;
// ===========================================================================

function isFunctionNode(
  node: ts.Node,
): node is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isControlFlow(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node)
  );
}

function isBranch(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isSwitchStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node)
  );
}

// Depth + cyclomatic share one own-body traversal (both stop at nested function boundaries).
function measureDepthAndComplexity(root: ts.Node): { depth: number; complexity: number } {
  let maxDepth = 0;
  let complexity = 1;
  function walk(n: ts.Node, depth: number): void {
    if (isFunctionNode(n) && n !== root) return;
    if (isBranch(n)) complexity++;
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    )
      complexity++;
    const nextDepth = isControlFlow(n) ? depth + 1 : depth;
    if (nextDepth > maxDepth) maxDepth = nextDepth;
    ts.forEachChild(n, (child) => walk(child, nextDepth));
  }
  ts.forEachChild(root, (child) => walk(child, 0));
  return { depth: maxDepth, complexity };
}

function countLines(node: ts.Node, sf: ts.SourceFile): number {
  const startLine = sf.getLineAndCharacterOfPosition(node.getStart()).line;
  const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  return endLine - startLine + 1;
}

function measureCallbackDepth(root: ts.Node): number {
  let maxDepth = 0;
  function walk(n: ts.Node, depth: number): void {
    const isCallback =
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isCallExpression(n.parent);
    const nextDepth = isCallback ? depth + 1 : depth;
    if (nextDepth > maxDepth) maxDepth = nextDepth;
    ts.forEachChild(n, (child) => walk(child, nextDepth));
  }
  ts.forEachChild(root, (child) => walk(child, 0));
  return maxDepth;
}

function getFunctionName(node: ts.Node): string {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name)
    return ts.isComputedPropertyName(node.name) ? node.name.getText() : node.name.text;
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name))
    return node.parent.name.text;
  return "(anonymous)";
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Function complexity: depth, cyclomatic, statements, lines, params, callbacks",
    subChecks: 6,
  },
  check(ctx) {
    const maxDepth = (ctx.options.maxDepth as number) ?? MAX_DEPTH;
    const maxComplexity = (ctx.options.maxComplexity as number) ?? MAX_COMPLEXITY;
    const maxStatements = (ctx.options.maxStatements as number) ?? MAX_STATEMENTS;
    const maxLines = (ctx.options.maxLines as number) ?? MAX_LINES;
    const maxParams = (ctx.options.maxParams as number) ?? MAX_PARAMS;
    const maxCallbacks = (ctx.options.maxCallbacks as number) ?? MAX_CALLBACKS;

    ctx.walk((node) => {
      if (!isFunctionNode(node)) return;
      if (!node.body) return;
      const name = getFunctionName(node);

      const { depth, complexity } = measureDepthAndComplexity(node);
      if (depth > maxDepth) {
        ctx.reportAt(node, `Reduce nesting in ${name} -- depth ${depth} exceeds max ${maxDepth}`, {
          action: "reduce-nesting",
          pattern: "Extract nested blocks to functions or use guard clauses",
        });
      }

      if (complexity > maxComplexity) {
        ctx.reportAt(node, `Reduce complexity of ${name} -- cyclomatic ${complexity} exceeds max ${maxComplexity}`, {
          action: "reduce-complexity",
          pattern: "Split into smaller functions or use lookup tables",
        });
      }

      if (ts.isBlock(node.body) && node.body.statements.length > maxStatements) {
        ctx.reportAt(node, `Extract logic from ${name} -- ${node.body.statements.length} statements exceed max ${maxStatements}`, {
          action: "extract-function",
          pattern: "Extract statement groups into named functions",
        });
      }

      const lines = countLines(node, ctx.sourceFile);
      if (lines > maxLines) {
        ctx.reportAt(node, `Split ${name} -- ${lines} lines exceed max ${maxLines}`, {
          action: "split-function",
          pattern: "Split into smaller, focused functions",
        });
      }

      if (node.parameters.length > maxParams) {
        ctx.reportAt(node, `Reduce parameters of ${name} -- ${node.parameters.length} params exceed max ${maxParams}`, {
          action: "reduce-params",
          pattern: "Use options object: fn({ a, b, c }: Options)",
        });
      }

      const callbackDepth = measureCallbackDepth(node);
      if (callbackDepth > maxCallbacks) {
        ctx.reportAt(node, `Extract callbacks from ${name} -- ${callbackDepth} levels exceed max ${maxCallbacks}`, {
          action: "reduce-callbacks",
          pattern: "Extract callbacks to named functions or use async/await",
        });
      }
    });
  },
});
