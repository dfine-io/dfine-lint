// Flags async exported functions in "use client" files.
// React Client Components cannot be async — causes runtime error.
import ts from "typescript";
import { defineRule, hasDirective, isTypeFromPackage, unwrapPromiseType } from "@dfine-io-gmbh/dlint";

// React's element types: a helper returning { type, props, key } or a RefObject is no component (same list in rules-of-hooks)
const REACT_ELEMENT_TYPES = new Set(["Element", "ReactElement", "ReactNode", "ReactPortal"]);

function isJsxReturnType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const unwrapped = unwrapPromiseType(type, checker);
  const parts = unwrapped.isUnion() && !unwrapped.aliasSymbol ? unwrapped.types : [unwrapped];
  return parts.some((t) => {
    const sym = t.aliasSymbol ?? t.getSymbol();
    return !!sym && REACT_ELEMENT_TYPES.has(sym.name) && isTypeFromPackage(t, checker, "react");
  });
}

function isComponentDeclaration(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  checker: ts.TypeChecker,
): boolean {
  const sig = checker.getSignatureFromDeclaration(node);
  if (!sig) return false;
  return isJsxReturnType(checker.getReturnTypeOfSignature(sig), checker);
}

function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isAsync(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Client Components cannot be async — causes runtime error",
  },
  check(ctx) {
    if (!hasDirective(ctx.sourceFile, "use client")) return;

    for (const stmt of ctx.sourceFile.statements) {
      // async function Component() { ... }
      if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && isAsync(stmt) && isComponentDeclaration(stmt, ctx.checker)) {
        ctx.reportAt(
          stmt,
          `Remove async from Client Component '${stmt.name?.text ?? "anonymous"}' -- Client Components cannot be async`,
          { action: "remove-async", pattern: "Remove async or move to Server Component", reference: "https://react.dev/reference/rsc/server-components" },
        );
      }
      // export const Component = async () => { ... }
      if (ts.isVariableStatement(stmt) && isExported(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) &&
            isAsync(decl.initializer) &&
            isComponentDeclaration(decl.initializer, ctx.checker)
          ) {
            ctx.reportAt(
              decl,
              `Remove async from Client Component '${decl.name.text}' -- Client Components cannot be async`,
              { action: "remove-async", pattern: "Remove async or move to Server Component", reference: "https://react.dev/reference/rsc/server-components" },
            );
          }
        }
      }
    }
  },
});
