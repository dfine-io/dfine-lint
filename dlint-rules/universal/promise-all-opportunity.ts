// Detects consecutive await statements with no data dependency that could run in parallel.
// Tracks transitive dependencies via symbol analysis across statement boundaries.
// Severity: warning — semantic ordering (audit-after-mutation) must be decided by developer.
import ts from "typescript";
import { defineRule, valueSymbolOf } from "@dfine-io-gmbh/dlint";

type AwaitInfo = {
  stmt: ts.Statement;
  // Every name the await binds, destructured ones included; empty for a bare `await f();`
  declSymbols: ts.Symbol[];
  awaitExpr: ts.AwaitExpression;
};

function boundSymbols(name: ts.BindingName, checker: ts.TypeChecker): ts.Symbol[] {
  if (ts.isIdentifier(name)) {
    const sym = checker.getSymbolAtLocation(name);
    return sym ? [sym] : [];
  }
  return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : boundSymbols(el.name, checker)));
}

function extractAwait(stmt: ts.Statement, checker: ts.TypeChecker): AwaitInfo | null {
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (decl.initializer && ts.isAwaitExpression(decl.initializer)) {
        return { stmt, declSymbols: boundSymbols(decl.name, checker), awaitExpr: decl.initializer };
      }
    }
  }
  if (ts.isExpressionStatement(stmt) && ts.isAwaitExpression(stmt.expression)) {
    return { stmt, declSymbols: [], awaitExpr: stmt.expression };
  }
  return null;
}

// What a call reads: its arguments and the root of its receiver (this.db roots at db), never the callee name itself
function inputSymbols(expr: ts.Expression, checker: ts.TypeChecker): ts.Symbol[] {
  if (!ts.isCallExpression(expr)) return [];
  const roots: ts.Node[] = [...expr.arguments];
  if (ts.isPropertyAccessExpression(expr.expression)) roots.push(expr.expression.expression);
  const symbols: ts.Symbol[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const member = checker.getSymbolAtLocation(n.name);
      if (member) symbols.push(member);
      return;
    }
    if (ts.isPropertyAccessExpression(n)) return visit(n.expression);
    if (ts.isIdentifier(n)) {
      const sym = valueSymbolOf(n, checker);
      if (sym) symbols.push(sym);
      return;
    }
    ts.forEachChild(n, visit);
  };
  roots.forEach(visit);
  return symbols;
}

function usesSymbol(node: ts.Node, target: ts.Symbol, checker: ts.TypeChecker): boolean {
  if (ts.isIdentifier(node)) {
    const sym = checker.getSymbolAtLocation(node);
    if (sym === target) return true;
    // A property a shorthand { a } created still carries a: holder().a reads the awaited value
    const decl = sym && sym.flags & ts.SymbolFlags.Property ? sym.valueDeclaration : undefined;
    if (decl && ts.isShorthandPropertyAssignment(decl) && checker.getShorthandAssignmentValueSymbol(decl) === target) return true;
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
      // import("x") names its specifier; its type would print the resolved absolute path
      if (ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword)
        return `import(${e.arguments[0]?.getText() ?? ""})`;
      if (ts.isCallExpression(e) && ts.isIdentifier(e.expression))
        return `${e.expression.text}(...)`;
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression))
        return `${ts.isIdentifier(e.expression.expression) ? e.expression.expression.text + "." : ""}${e.expression.name.text}(...)`;
      // Source text, not the type: a type string can carry an absolute import path
      return (e.getText().split("\n")[0] ?? "").slice(0, 40);
    }

    function checkChain(chain: AwaitInfo[]): void {
      if (chain.length < 2) return;
      const head = chain[0];
      if (!head) return;
      // A try around the chain orders its failures; the walk stops at the function the chain runs in
      for (let parent = head.stmt.parent; !ts.isFunctionLike(parent) && !ts.isSourceFile(parent); parent = parent.parent) {
        if (ts.isTryStatement(parent) || ts.isCatchClause(parent)) return;
      }

      for (let i = 0; i < chain.length - 1; i++) {
        const first = chain[i];
        const second = chain[i + 1];
        if (!first || !second) continue;
        const reads = (s: ts.Symbol): boolean => usesSymbol(second.awaitExpr, s, ctx.checker);
        if (first.declSymbols.some(reads)) continue;
        // A bare await runs only for its effect; when the next call reads the same input, the order is observable
        if (first.declSymbols.length === 0 && inputSymbols(first.awaitExpr.expression, ctx.checker).some(reads)) continue;
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
