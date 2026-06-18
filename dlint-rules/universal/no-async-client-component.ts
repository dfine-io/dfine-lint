// Flags async exported functions in "use client" files.
// React Client Components cannot be async — causes runtime error.
import ts from "typescript";
import { defineRule, hasDirective, unwrapPromiseType } from "@dfine-io-gmbh/dlint";

function isJsxReturnType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const unwrapped = unwrapPromiseType(type, checker);
  if (unwrapped.isUnion()) return unwrapped.types.some(t => isJsxReturnType(t, checker));
  if (unwrapped.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return false;
  const props = unwrapped.getProperties();
  return props.some(p => p.name === "type") && props.some(p => p.name === "props") && props.some(p => p.name === "key");
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
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;
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
