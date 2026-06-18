// Detects logic errors: duplicate switch cases, duplicate object keys,
// redundant boolean expressions, and unnecessary conditional branches.
// Logic errors compile and run but produce wrong results silently.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function symbolsMatch(a: ts.Node, b: ts.Node, checker: ts.TypeChecker): boolean {
  if (ts.isElementAccessExpression(a) && ts.isElementAccessExpression(b)) {
    return (
      symbolsMatch(a.expression, b.expression, checker) &&
      symbolsMatch(a.argumentExpression, b.argumentExpression, checker)
    );
  }
  const symA =
    ts.isIdentifier(a) || ts.isPropertyAccessExpression(a)
      ? checker.getSymbolAtLocation(a)
      : undefined;
  const symB =
    ts.isIdentifier(b) || ts.isPropertyAccessExpression(b)
      ? checker.getSymbolAtLocation(b)
      : undefined;
  if (symA && symB) return symA === symB;
  if (ts.isNumericLiteral(a) && ts.isNumericLiteral(b)) return a.text === b.text;
  if (ts.isStringLiteral(a) && ts.isStringLiteral(b)) return a.text === b.text;
  return false;
}

function isElementAssignment(
  stmt: ts.Statement,
): stmt is ts.ExpressionStatement & { expression: ts.BinaryExpression & { left: ts.ElementAccessExpression } } {
  if (!ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  return (
    stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isElementAccessExpression(stmt.expression.left)
  );
}

export default defineRule({
  meta: {
    category: "quality",
    description: "TypeChecker-based logic bugs: identical conditions, leaked render, dead writes",
    subChecks: 5,
  },
  check(ctx) {
    const checker = ctx.checker;

    ctx.walk((node) => {
      // 1. identical conditions in if/else-if chain
      if (!ts.isIfStatement(node)) {
        /* skip */
      } else if (
        node.elseStatement &&
        ts.isIfStatement(node.elseStatement) &&
        symbolsMatch(node.expression, node.elseStatement.expression, checker)
      ) {
        ctx.reportAt(node.elseStatement.expression, "Fix duplicate condition in if/else-if chain -- each branch must test uniquely", {
          action: "fix-condition",
          pattern: "Each branch must test a unique condition",
        });
      }

      // 2. element immediately overwritten
      if (ts.isBlock(node)) {
        for (let i = 1; i < node.statements.length; i++) {
          const prev = node.statements[i - 1];
          const curr = node.statements[i];
          if (!prev || !curr) continue;
          if (!isElementAssignment(prev) || !isElementAssignment(curr)) continue;
          if (!symbolsMatch(prev.expression.left, curr.expression.left, checker)) continue;
          ctx.reportAt(prev, "Remove dead write -- element is immediately overwritten", {
            action: "remove-dead-write",
            pattern: "Remove the dead write - the element is immediately overwritten",
          });
        }
      }

      // 4. condition is always truthy or falsy (TypeChecker literal type)
      if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isWhileStatement(node)) {
        const cond =
          ts.isIfStatement(node) || ts.isWhileStatement(node) ? node.expression : node.condition;
        const condType = checker.getTypeAtLocation(cond);
        const intrinsic = (condType as { intrinsicName?: string }).intrinsicName;
        if (intrinsic === "true" || intrinsic === "false") {
          ctx.reportAt(cond, `Remove dead branch -- condition is always ${intrinsic}`, {
            action: "simplify-branch",
            pattern: "Remove dead branch or unnecessary condition",
          });
        }
      }

      // 5. jsx leaked render — number && <JSX> renders 0
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        const leftType = checker.getTypeAtLocation(node.expression.left);
        if (leftType.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
          ctx.reportAt(node.expression.left, "Guard render expression -- number && <JSX> leaks 0 to output", {
            action: "guard-render",
            pattern: "Guard with a boolean - {count > 0 && <C/>} not {count && <C/>}",
          });
        }
      }

      // 7. variable assigned then immediately reassigned
      if (ts.isBlock(node)) {
        for (let i = 0; i < node.statements.length - 1; i++) {
          const curr = node.statements[i];
          const next = node.statements[i + 1];
          if (!curr || !next) continue;
          if (!ts.isVariableStatement(curr) || !ts.isExpressionStatement(next)) continue;
          if (curr.declarationList.declarations.length !== 1) continue;
          const decl = curr.declarationList.declarations[0];
          if (!decl) continue;
          if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
          if (!ts.isBinaryExpression(next.expression)) continue;
          if (next.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
          if (!ts.isIdentifier(next.expression.left)) continue;
          const declSym = checker.getSymbolAtLocation(decl.name);
          const assignSym = checker.getSymbolAtLocation(next.expression.left);
          if (declSym && declSym === assignSym) {
            // Pipeline: x = f(x) — right side uses the declared variable as input, not dead init
            let rhsUsesDecl = false;
            function scanRhs(n: ts.Node): void {
              if (rhsUsesDecl) return;
              if (ts.isIdentifier(n) && checker.getSymbolAtLocation(n) === declSym) { rhsUsesDecl = true; return; }
              ts.forEachChild(n, scanRhs);
            }
            scanRhs(next.expression.right);
            if (!rhsUsesDecl) {
              ctx.reportAt(curr, "Remove dead initial value -- variable is immediately reassigned", {
                action: "remove-initial-value",
                pattern: "Remove the dead initial value - the variable is immediately reassigned",
              });
            }
          }
        }
      }

      // 8. removed — findReferences classifies shorthand properties as isWriteAccess:true
      // which makes write-only detection unreliable (knip covers unused variables instead)
    });
  },
});
