// Flags code that can be simplified: useless else after return, redundant continue/return,
// collapsible if, useless constructor, redundant boolean return, prefer while,
// prefer immediate return, prefer object literal.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Simplification: useless-else, collapsible-if, immediate-return, object-literal",
    subChecks: 8,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-useless-else after return/throw + redundant continue/return
      if (ts.isIfStatement(node) && node.elseStatement) {
        const thenBlock = ts.isBlock(node.thenStatement) ? node.thenStatement : null;
        if (thenBlock && thenBlock.statements.length > 0) {
          const last = thenBlock.statements[thenBlock.statements.length - 1];
          if (
            last &&
            (ts.isReturnStatement(last) || ts.isThrowStatement(last) || ts.isContinueStatement(last) || ts.isBreakStatement(last)) &&
            ts.isBlock(node.elseStatement)
          ) {
            ctx.reportAt(node.elseStatement, "Unnecessary else after return/throw", { action: "remove-useless-else", pattern: "Remove else after return/throw, move code after if" });
          }
        }
      }
      // Redundant continue/return at block end
      if (ts.isBlock(node) && node.statements.length > 0) {
        const last = node.statements[node.statements.length - 1];
        if (last && ts.isContinueStatement(last) && !last.label && node.parent &&
            (ts.isForStatement(node.parent) || ts.isForInStatement(node.parent) || ts.isForOfStatement(node.parent) ||
              ts.isWhileStatement(node.parent) || ts.isDoStatement(node.parent))) {
          ctx.reportAt(last, "Remove continue at end of loop block", { action: "remove-redundant-continue", pattern: "Delete continue at loop body end", fix: ctx.deleteNode(last) });
        }
        if (last && ts.isReturnStatement(last) && !last.expression && node.parent &&
            (ts.isFunctionDeclaration(node.parent) || ts.isMethodDeclaration(node.parent) ||
              ts.isArrowFunction(node.parent) || ts.isFunctionExpression(node.parent))) {
          ctx.reportAt(last, "Delete empty return at function end", { action: "remove-redundant-return", pattern: "Remove empty return statement", fix: ctx.deleteNode(last) });
        }
      }

      // no-collapsible-if
      if (ts.isIfStatement(node) && !node.elseStatement) {
        const [inner] = ts.isBlock(node.thenStatement) && node.thenStatement.statements.length === 1
          ? node.thenStatement.statements : [];
        if (inner && ts.isIfStatement(inner) && !inner.elseStatement) {
          ctx.reportAt(node, "Merge nested if conditions with &&", { action: "merge-conditions", pattern: "Combine with && into single condition" });
        }
      }

      // no-useless-constructor: empty constructor that only calls super
      if (ts.isConstructorDeclaration(node) && node.body) {
        const hasParamProps = node.parameters.some((p) =>
          ts.getCombinedModifierFlags(p) & ts.ModifierFlags.ParameterPropertyModifier
        );
        if (hasParamProps) return;
        const isEmpty = node.body.statements.length === 0 && node.parameters.length === 0;
        const [firstStmt] = node.body.statements;
        const isSuperOnly =
          node.body.statements.length === 1 &&
          firstStmt &&
          ts.isExpressionStatement(firstStmt) &&
          ts.isCallExpression(firstStmt.expression) &&
          firstStmt.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
          node.parameters.length === 0;
        if (isEmpty || isSuperOnly) {
          ctx.reportAt(node, "Delete empty or super-only constructor", { action: "remove-constructor", pattern: "Remove useless constructor", fix: ctx.deleteNode(node) });
        }
      }

      // redundant boolean return
      if (ts.isBlock(node)) {
        for (let i = 0; i < node.statements.length - 1; i++) {
          const curr = node.statements[i];
          const next = node.statements[i + 1];
          if (!curr || !next) continue;
          if (!ts.isIfStatement(curr) || curr.elseStatement) continue;
          const thenBody = ts.isBlock(curr.thenStatement) ? curr.thenStatement.statements[0] : curr.thenStatement;
          if (!thenBody || !ts.isReturnStatement(thenBody) || !ts.isReturnStatement(next)) continue;
          if (thenBody.expression?.kind !== ts.SyntaxKind.TrueKeyword) continue;
          if (next.expression?.kind !== ts.SyntaxKind.FalseKeyword) continue;
          ctx.reportAt(curr, "Simplify redundant boolean return", {
            action: "simplify", pattern: "Replace if (x) return true; return false with return x",
          });
        }
      }

      // prefer while over empty for
      if (ts.isForStatement(node) && !node.initializer && !node.incrementor && node.condition) {
        ctx.reportAt(node, "Replace for loop with while when no init/increment", {
          action: "use-while", pattern: "Replace for (;cond;) with while (cond)",
        });
      }

      // prefer immediate return (symbol-based identity)
      if (ts.isBlock(node)) {
        for (let i = 0; i < node.statements.length - 1; i++) {
          const curr = node.statements[i];
          const next = node.statements[i + 1];
          if (!curr || !next) continue;
          if (!ts.isVariableStatement(curr) || !ts.isReturnStatement(next)) continue;
          if (curr.declarationList.declarations.length !== 1) continue;
          const decl = curr.declarationList.declarations[0];
          if (!decl) continue;
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          if (!next.expression || !ts.isIdentifier(next.expression)) continue;
          const declSym = ctx.checker.getSymbolAtLocation(decl.name);
          const retSym = ctx.checker.getSymbolAtLocation(next.expression);
          const declType = decl.type ? ctx.checker.getTypeFromTypeNode(decl.type) : null;
          if (declType && declType.flags & ts.TypeFlags.Never) continue;
          if (declSym && declSym === retSym) {
            ctx.reportAt(curr, "Return expression directly without temp variable", {
              action: "inline-return", pattern: "Replace const x = expr; return x with return expr",
            });
          }
        }
      }

      // prefer object literal over empty object + assignment (symbol-based)
      if (ts.isBlock(node)) {
        for (let i = 0; i < node.statements.length - 1; i++) {
          const curr = node.statements[i];
          const next = node.statements[i + 1];
          if (!curr || !next) continue;
          if (!ts.isVariableStatement(curr) || !ts.isExpressionStatement(next)) continue;
          if (curr.declarationList.declarations.length !== 1) continue;
          const decl = curr.declarationList.declarations[0];
          if (!decl) continue;
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          if (!ts.isObjectLiteralExpression(decl.initializer) || decl.initializer.properties.length > 0) continue;
          if (!ts.isBinaryExpression(next.expression) || !ts.isPropertyAccessExpression(next.expression.left)) continue;
          const declSym = ctx.checker.getSymbolAtLocation(decl.name);
          const assignSym = ctx.checker.getSymbolAtLocation(next.expression.left.expression);
          if (declSym && declSym === assignSym) {
            ctx.reportAt(decl, "Use object literal syntax with properties", {
              action: "use-literal", pattern: "Replace const o = {}; o.a = 1 with const o = { a: 1 }",
            });
          }
        }
      }
    });
  },
});
