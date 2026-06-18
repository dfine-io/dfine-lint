// Detects consecutive await statements with no data dependency that could run in parallel.
// Tracks transitive dependencies via symbol analysis across statement boundaries.
// Severity: warning — semantic ordering (audit-after-mutation) must be decided by developer.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

type AwaitInfo = {
  stmt: ts.Statement;
  declSymbol: ts.Symbol | null;
  awaitExpr: ts.AwaitExpression;
};

function extractAwait(stmt: ts.Statement, checker: ts.TypeChecker): AwaitInfo | null {
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (decl.initializer && ts.isAwaitExpression(decl.initializer) && ts.isIdentifier(decl.name)) {
        const sym = checker.getSymbolAtLocation(decl.name);
        return { stmt, declSymbol: sym ?? null, awaitExpr: decl.initializer };
      }
    }
  }
  if (ts.isExpressionStatement(stmt) && ts.isAwaitExpression(stmt.expression)) {
    return { stmt, declSymbol: null, awaitExpr: stmt.expression };
  }
  return null;
}

function usesSymbol(node: ts.Node, target: ts.Symbol, checker: ts.TypeChecker): boolean {
  if (ts.isIdentifier(node)) {
    const sym = checker.getSymbolAtLocation(node);
    if (sym === target) return true;
    if (sym && sym.flags & ts.SymbolFlags.Property) {
      const valueDecl = sym.valueDeclaration;
      if (valueDecl && ts.isShorthandPropertyAssignment(valueDecl)) {
        const valueSym = checker.getShorthandAssignmentValueSymbol(valueDecl);
        if (valueSym === target) return true;
      }
    }
  }
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found) found = usesSymbol(child, target, checker);
  });
  return found;
}

export default defineRule({
  meta: {
    category: "performance",
    description: "Sequential awaits that could run in parallel with Promise.all",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isBlock(node)) return;
      const chain: AwaitInfo[] = [];
      for (const stmt of node.statements) {
        const info = extractAwait(stmt, ctx.checker);
        if (info) {
          chain.push(info);
        } else {
          checkChain(chain);
          chain.length = 0;
        }
      }
      checkChain(chain);
    });

    function describeExpr(e: ts.Expression): string {
      if (ts.isCallExpression(e) && ts.isIdentifier(e.expression))
        return `${e.expression.text}(...)`;
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression))
        return `${ts.isIdentifier(e.expression.expression) ? e.expression.expression.text + "." : ""}${e.expression.name.text}(...)`;
      return ctx.checker.typeToString(ctx.checker.getTypeAtLocation(e)).slice(0, 40);
    }

    function checkChain(chain: AwaitInfo[]): void {
      if (chain.length < 2) return;
      const head = chain[0];
      if (!head) return;
      let parent = head.stmt.parent;
      while (parent) {
        if (ts.isTryStatement(parent) || ts.isCatchClause(parent)) return;
        if (ts.isBlock(parent) && parent.parent && ts.isTryStatement(parent.parent)) return;
        parent = parent.parent;
      }

      for (let i = 0; i < chain.length - 1; i++) {
        const first = chain[i];
        const second = chain[i + 1];
        if (!first || !second) continue;
        if (first.declSymbol && usesSymbol(second.awaitExpr, first.declSymbol, ctx.checker))
          continue;
        let transitiveDependent = false;
        const block = first.stmt.parent;
        if (ts.isBlock(block)) {
          for (const s of block.statements) {
            if (s === second.stmt) break;
            if (ts.isVariableStatement(s)) {
              for (const d of s.declarationList.declarations) {
                if (ts.isIdentifier(d.name)) {
                  const sym = ctx.checker.getSymbolAtLocation(d.name);
                  if (sym && usesSymbol(second.awaitExpr, sym, ctx.checker)) transitiveDependent = true;
                }
              }
            }
          }
        }
        if (transitiveDependent) continue;
        ctx.reportAt(
          second.stmt,
          `Sequential awaits could be Promise.all: ${describeExpr(first.awaitExpr.expression)} + ${describeExpr(second.awaitExpr.expression)}`,
          {
            action: "use-promise-all",
            pattern: "Combine independent awaits into one await Promise.all([...])",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all",
          }
        );
      }
    }
  },
});
