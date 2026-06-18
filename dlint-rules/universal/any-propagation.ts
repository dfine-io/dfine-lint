// Prevents `any` type from spreading through assignments, returns, and property access.
// Flags variable assignment from any-typed expression, untyped returns, and any-typed calls.
// Exempts JSON.parse, catch variables, dynamic imports, and third-party calls.
// Unchecked any propagation silently disables type safety across the entire call chain.
import ts from "typescript";
import { defineRule, isLibDeclaration, isNodeModulesDeclaration } from "@dfine-io-gmbh/dlint";

function isGlobalSymbol(id: ts.Identifier, checker: ts.TypeChecker): boolean {
  const sym = checker.getSymbolAtLocation(id);
  return !!sym && isLibDeclaration(sym);
}

function isJsonParse(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "JSON" &&
    node.expression.name.text === "parse" &&
    isGlobalSymbol(node.expression.expression, checker)
  );
}

function isDynamicImport(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  );
}

function isReflectGet(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Reflect" &&
    node.expression.name.text === "get" &&
    isGlobalSymbol(node.expression.expression, checker)
  );
}

export default defineRule({
  meta: {
    category: "quality",
    description: "any type propagation through assignments and returns",
  },
  check(ctx) {
    function isAnyType(node: ts.Node): boolean {
      return (
        (ctx.checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any) !== 0
      );
    }

    function isCatchVariable(node: ts.Node): boolean {
      if (!ts.isIdentifier(node)) return false;
      const symbol = ctx.checker.getSymbolAtLocation(node);
      if (!symbol?.declarations?.length) return false;
      return symbol.declarations.some((d) => ts.isCatchClause(d.parent));
    }

    function isThirdPartyCall(node: ts.Expression): boolean {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
      const objType = ctx.checker.getTypeAtLocation(node.expression.expression);
      const sym = objType.symbol ?? objType.aliasSymbol;
      return !!sym && isNodeModulesDeclaration(sym);
    }

    function report(action: string, message: string, node: ts.Node): void {
      ctx.reportAt(node, message, {
        action,
        pattern: "Add explicit type annotation or use unknown instead of any",
        reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any",
      });
    }

    ctx.walk((node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        !isJsonParse(node.initializer, ctx.checker) &&
        !isReflectGet(node.initializer, ctx.checker) &&
        !isThirdPartyCall(node.initializer) &&
        !isCatchVariable(node.initializer) &&
        isAnyType(node.initializer)
      ) {
        report(
          "any-assignment",
          `Add explicit type annotation -- unsafe any assignment: ${node.initializer.getText(ctx.sourceFile).slice(0, 40)}`,
          node
        );
      }

      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        !isCatchVariable(node.expression) &&
        isAnyType(node.expression)
      ) {
        // Skip: enclosing function has explicit return type annotation (any safely contained)
        let fnParent: ts.Node | undefined = node.parent;
        while (
          fnParent &&
          !ts.isFunctionDeclaration(fnParent) &&
          !ts.isArrowFunction(fnParent) &&
          !ts.isFunctionExpression(fnParent) &&
          !ts.isMethodDeclaration(fnParent)
        ) {
          fnParent = fnParent.parent;
        }
        const hasFnReturnType = fnParent && (
          (ts.isFunctionDeclaration(fnParent) && fnParent.type) ||
          (ts.isArrowFunction(fnParent) && fnParent.type) ||
          (ts.isFunctionExpression(fnParent) && fnParent.type) ||
          (ts.isMethodDeclaration(fnParent) && fnParent.type)
        );
        if (!hasFnReturnType) {
          report("any-return", "Add return type annotation -- returning any propagates unsafety", node.expression);
        }
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        !isCatchVariable(node.expression) &&
        isAnyType(node.expression)
      ) {
        report(
          "any-member-access",
          `Add type annotation -- unsafe any member access: ${node.expression.getText(ctx.sourceFile).slice(0, 30)}.${node.name.text}`,
          node
        );
      }

      if (
        ts.isCallExpression(node) &&
        isAnyType(node.expression) &&
        !isCatchVariable(node.expression) &&
        !isDynamicImport(node) &&
        !ts.isPropertyAccessExpression(node.expression)
      ) {
        report(
          "any-call",
          `Add type annotation -- unsafe any-typed call: ${node.expression.getText(ctx.sourceFile).slice(0, 30)}()`,
          node.expression
        );
      }
    });
  },
});
