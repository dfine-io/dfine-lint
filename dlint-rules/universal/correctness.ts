// Detects common correctness issues: assignments in conditions, constant conditions,
// comparison to self, unreachable code after return/throw/break.
// These patterns are almost always bugs, not intentional logic.
import ts from "typescript";
import { defineRule, isInsideLoop } from "@dfine-io-gmbh/dlint";

function isDescendantOf(child: ts.Node, ancestor: ts.Node): boolean {
  let current = child.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function nodesReferSameSymbol(
  a: ts.Node,
  b: ts.Node,
  checker: ts.TypeChecker
): boolean {
  if (a.kind !== b.kind) return false;
  // Identifier or PrivateIdentifier: compare via TypeChecker symbol identity
  if (
    (ts.isIdentifier(a) || ts.isPrivateIdentifier(a)) &&
    (ts.isIdentifier(b) || ts.isPrivateIdentifier(b))
  ) {
    const symA = checker.getSymbolAtLocation(a);
    const symB = checker.getSymbolAtLocation(b);
    return !!symA && symA === symB;
  }
  // Property access: x.a === x.a — both object and property must match
  if (ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b)) {
    return (
      nodesReferSameSymbol(a.expression, b.expression, checker) &&
      nodesReferSameSymbol(a.name, b.name, checker)
    );
  }
  // Element access: x[0] === x[0] — both object and index must match
  if (ts.isElementAccessExpression(a) && ts.isElementAccessExpression(b)) {
    return (
      nodesReferSameSymbol(a.expression, b.expression, checker) &&
      nodesReferSameSymbol(a.argumentExpression, b.argumentExpression, checker)
    );
  }
  // Literal values: isLiteral() narrows to LiteralType with .value
  const typeA = checker.getTypeAtLocation(a);
  const typeB = checker.getTypeAtLocation(b);
  if (typeA.isLiteral() && typeB.isLiteral()) {
    // BigInt literals: PseudoBigInt has negative + base10Value components
    if (typeA.flags & ts.TypeFlags.BigIntLiteral) {
      const valA = (typeA as ts.BigIntLiteralType).value;
      const valB = (typeB as ts.BigIntLiteralType).value;
      return valA.negative === valB.negative && valA.base10Value === valB.base10Value;
    }
    // string/number: direct value compare
    return typeA.value === typeB.value;
  }
  return false;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Bug-prevention: self-assign, unsafe-finally, one-iteration-loop, param-reassign",
    subChecks: 11,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-self-assign: x = x
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        nodesReferSameSymbol(node.left, node.right, ctx.checker)
      ) {
        ctx.reportAt(node, "Remove self-assignment -- has no effect", { action: "remove-self-assign", pattern: "Remove x = x", fix: ts.isExpressionStatement(node.parent) ? ctx.deleteNode(node.parent) : undefined });
      }

      // no-self-compare: x === x
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        nodesReferSameSymbol(node.left, node.right, ctx.checker)
      ) {
        ctx.reportAt(node, "Use Number.isNaN() instead of self-comparison for NaN checks", { action: "fix-self-compare", pattern: "Use Number.isNaN(x) for NaN checks", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators" });
      }

      // no-one-iteration-loop
      if (
        (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
          ts.isWhileStatement(node) || ts.isDoStatement(node)) &&
        ts.isBlock(node.statement)
      ) {
        const block = node.statement;
        if (block.statements.length > 0) {
          const first = block.statements[0];
          if (first && (ts.isReturnStatement(first) || ts.isThrowStatement(first) || ts.isBreakStatement(first))) {
            ctx.reportAt(node, "Remove single-iteration loop -- first statement terminates", { action: "remove-single-iteration-loop", pattern: "if (condition) { return ... } instead of loop" });
          }
        }
      }

      // no-useless-catch: catch(e) { throw e }
      if (ts.isTryStatement(node) && node.catchClause) {
        const catchBlock = node.catchClause.block;
        if (catchBlock.statements.length === 1) {
          const varDecl = node.catchClause.variableDeclaration;
          const stmt = catchBlock.statements[0];
          if (
            stmt && ts.isThrowStatement(stmt) && stmt.expression && varDecl &&
            ts.isIdentifier(varDecl.name) && ts.isIdentifier(stmt.expression)
          ) {
            const catchSym = ctx.checker.getSymbolAtLocation(varDecl.name);
            const throwSym = ctx.checker.getSymbolAtLocation(stmt.expression);
            if (catchSym && catchSym === throwSym) {
              ctx.reportAt(node.catchClause, "Remove useless catch -- re-throws without handling", { action: "remove-useless-catch", pattern: "Remove try/catch wrapper or add error handling" });
            }
          }
        }
      }

      // no-sparse-array
      if (ts.isArrayLiteralExpression(node)) {
        for (const el of node.elements) {
          if (el.kind === ts.SyntaxKind.OmittedExpression) {
            ctx.reportAt(node, "Replace sparse array holes with explicit undefined", { action: "fill-sparse-array", pattern: "[undefined, undefined] instead of [, ,]" });
            break;
          }
        }
      }

      // no-unsafe-finally + no-await-in-finally
      if (ts.isTryStatement(node) && node.finallyBlock) {
        for (const stmt of node.finallyBlock.statements) {
          if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) {
            ctx.reportAt(stmt, `Move ${ts.isReturnStatement(stmt) ? "return" : "throw"} out of finally block -- overrides try/catch result`, { action: "remove-from-finally", pattern: "Move return/throw before finally block" });
            break;
          }
        }
        // no-await-in-finally
        function findAwait(n: ts.Node): void {
          if (ts.isAwaitExpression(n)) {
            ctx.reportAt(n, "Move await out of finally block -- can mask thrown errors", { action: "move-await", pattern: "Move await outside finally block" });
          }
          if (!ts.isArrowFunction(n) && !ts.isFunctionExpression(n) && !ts.isFunctionDeclaration(n))
            ts.forEachChild(n, findAwait);
        }
        findAwait(node.finallyBlock);
      }

      // no-setter-return
      if (ts.isSetAccessor(node) && node.body) {
        function findReturn(n: ts.Node): void {
          if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
          if (ts.isReturnStatement(n) && n.expression) {
            ctx.reportAt(n, "Setter return value is ignored — remove return value", { action: "fix-setter", pattern: "Remove return value from setter" });
          }
          ts.forEachChild(n, findReturn);
        }
        ts.forEachChild(node.body, findReturn);
      }

      // no-param-reassign (=, +=, -=, etc. and ++/--)
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isIdentifier(node.left)
      ) {
        const symbol = ctx.checker.getSymbolAtLocation(node.left);
        if (symbol?.declarations?.some((d) => ts.isParameter(d))) {
          ctx.reportAt(node, `Parameter '${node.left.text}' reassigned — use local variable`, { action: "use-local-var", pattern: "const localVar = param; modify localVar" });
        }
      }
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
        ts.isIdentifier(node.operand)
      ) {
        const symbol = ctx.checker.getSymbolAtLocation(node.operand);
        if (symbol?.declarations?.some((d) => ts.isParameter(d))) {
          ctx.reportAt(node, `Parameter '${node.operand.text}' reassigned — use local variable`, { action: "use-local-var", pattern: "const localVar = param; modify localVar" });
        }
      }

      // no-loop-func (function in loop capturing mutable outer variable — TypeChecker-verified)
      if (
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        isInsideLoop(node)
      ) {
        let capturesMutable = false;
        const fnBody = node.body;
        function scanCapture(n: ts.Node): void {
          if (capturesMutable) return;
          if (ts.isIdentifier(n) && !ts.isPropertyAccessExpression(n.parent)) {
            const sym = ctx.checker.getSymbolAtLocation(n);
            if (sym?.valueDeclaration && !isDescendantOf(sym.valueDeclaration, node)) {
              const declParent = sym.valueDeclaration.parent;
              if (ts.isVariableDeclarationList(declParent) && (declParent.flags & ts.NodeFlags.Let)) {
                capturesMutable = true;
                return;
              }
            }
          }
          ts.forEachChild(n, scanCapture);
        }
        if (fnBody) scanCapture(fnBody);
        if (capturesMutable) {
          ctx.reportAt(node, "Hoist function out of loop -- captures mutable outer variable", { action: "hoist-function", pattern: "const fn = (item) => ...; for (...) fn(item)" });
        }
      }

      // unreachable-code: code after return/throw/break/continue in same block
      if (ts.isBlock(node) || ts.isSourceFile(node)) {
        const stmts = node.statements;
        let foundTerminator = false;
        let terminatorLine = 0;
        for (const stmt of stmts) {
          if (foundTerminator) {
            if (ts.isEmptyStatement(stmt) || ts.isTypeAliasDeclaration(stmt) ||
                ts.isInterfaceDeclaration(stmt) || ts.isEnumDeclaration(stmt) ||
                ts.isFunctionDeclaration(stmt)) continue;
            ctx.reportAt(stmt, `Remove unreachable code after terminator at line ${terminatorLine}`, { action: "remove-unreachable", pattern: "Remove unreachable code after return/throw/break/continue", fix: ctx.deleteNode(stmt) });
            break;
          }
          if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt) ||
              ts.isContinueStatement(stmt) || ts.isBreakStatement(stmt)) {
            foundTerminator = true;
            terminatorLine = ctx.sourceFile.getLineAndCharacterOfPosition(stmt.getStart(ctx.sourceFile)).line + 1;
          }
        }
      }
    });
  },
});
