// Flags x === 'literal' / x !== 'literal' where x has plain string type (no literal union, no brand).
// Suggests narrowing the source: literal union or branded type.
// Skips: external declarations, empty-string sentinel checks, narrowing-guard patterns
// where the operand feeds a narrower literal-union setter or return inside the guarded branch.
import ts from "typescript";
import { defineRule, isLibDeclaration, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

function isPlainStringType(type: ts.Type): boolean {
  if (!(type.flags & ts.TypeFlags.String)) return false;
  if (type.flags & ts.TypeFlags.StringLiteral) return false;
  if (type.isUnion()) return false;
  if (type.isIntersection()) return false;
  return true;
}

function containsLiteralString(type: ts.Type): boolean {
  if (type.isStringLiteral()) return true;
  if (type.isUnion()) return type.types.some((t) => containsLiteralString(t));
  return false;
}

function isExternalSymbol(sym: ts.Symbol | undefined, checker: ts.TypeChecker): boolean {
  if (!sym) return false;
  const resolved = resolveSymbol(checker, sym);
  return isLibDeclaration(resolved) || isNodeModulesDeclaration(resolved);
}

function isStringEqualityOp(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
}

function getLiteralSide(
  node: ts.BinaryExpression,
): { literal: ts.StringLiteral; operand: ts.Expression } | null {
  if (ts.isStringLiteral(node.left) && !ts.isStringLiteral(node.right)) {
    return { literal: node.left, operand: node.right };
  }
  if (ts.isStringLiteral(node.right) && !ts.isStringLiteral(node.left)) {
    return { literal: node.right, operand: node.left };
  }
  return null;
}

function getOperandSymbol(operand: ts.Expression, checker: ts.TypeChecker): ts.Symbol | undefined {
  if (ts.isIdentifier(operand)) return checker.getSymbolAtLocation(operand);
  if (ts.isPropertyAccessExpression(operand)) return checker.getSymbolAtLocation(operand.name);
  return undefined;
}

function findEnclosingIf(node: ts.Node): ts.IfStatement | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isIfStatement(current)) return current;
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function findEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function sameSymbol(a: ts.Expression, b: ts.Expression, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(a) || !ts.isIdentifier(b)) return false;
  const symA = checker.getSymbolAtLocation(a);
  const symB = checker.getSymbolAtLocation(b);
  return Boolean(symA && symB && symA === symB);
}

function feedsNarrowerConsumer(body: ts.Node, operand: ts.Expression, checker: ts.TypeChecker): boolean {
  let narrows = false;
  function scan(n: ts.Node): void {
    if (narrows) return;
    if (ts.isCallExpression(n)) {
      for (let i = 0; i < n.arguments.length; i++) {
        const arg = n.arguments[i];
        if (!arg || !sameSymbol(arg, operand, checker)) continue;
        const sig = checker.getResolvedSignature(n);
        if (!sig) continue;
        const param = sig.getParameters()[i];
        if (!param) continue;
        const paramType = checker.getTypeOfSymbolAtLocation(param, arg);
        if (containsLiteralString(paramType)) {
          narrows = true;
          return;
        }
      }
    }
    if (ts.isReturnStatement(n) && n.expression && sameSymbol(n.expression, operand, checker)) {
      const fn = findEnclosingFunction(n);
      if (fn) {
        const sig = checker.getSignatureFromDeclaration(fn);
        if (sig) {
          const retType = checker.getReturnTypeOfSignature(sig);
          if (containsLiteralString(retType)) {
            narrows = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(n, scan);
  }
  scan(body);
  return narrows;
}

function isInsideNarrowingGuard(cmp: ts.BinaryExpression, operand: ts.Expression, checker: ts.TypeChecker): boolean {
  const ifStmt = findEnclosingIf(cmp);
  if (!ifStmt) return false;
  return feedsNarrowerConsumer(ifStmt.thenStatement, operand, checker);
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Plain-string === literal -- narrow source to literal union or branded type",
  },
  check(ctx) {
    if (ctx.sourceFile.fileName.endsWith(".d.ts")) return;

    ctx.walk((node) => {
      if (!ts.isBinaryExpression(node)) return;
      if (!isStringEqualityOp(node.operatorToken.kind)) return;

      const sides = getLiteralSide(node);
      if (!sides) return;

      if (sides.literal.text === "") return;

      const operandType = ctx.checker.getTypeAtLocation(sides.operand);
      if (!isPlainStringType(operandType)) return;

      const operandSym = getOperandSymbol(sides.operand, ctx.checker);
      if (isExternalSymbol(operandSym, ctx.checker)) return;

      if (isInsideNarrowingGuard(node, sides.operand, ctx.checker)) return;

      ctx.reportAt(
        node,
        `Plain-string compared to literal '${sides.literal.text}' -- narrow source to literal union or branded type`,
        {
          action: "narrow-source-type",
          pattern: "Narrow to a literal union or branded type - not plain string",
          reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types",
        },
      );
    });
  },
});
