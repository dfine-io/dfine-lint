// Flags `{ ... } as T` / `[ ... ] as T` on object/array literals where `satisfies T`
// would preserve literal precision without widening.
// Skips: `as const`, `as unknown`, expressions whose source type is unknown/any (boundary),
// and fully-redundant assertions (handled by universal/unnecessary-type-assertion).
import ts from "typescript";
import { defineRule, isAssignableTo } from "@dfine-io-gmbh/dlint";

function isConstAssertion(typeNode: ts.TypeNode): boolean {
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    return typeNode.typeName.text === "const";
  }
  return false;
}

function isUnknownOrAnyType(typeNode: ts.TypeNode): boolean {
  return (
    typeNode.kind === ts.SyntaxKind.UnknownKeyword ||
    typeNode.kind === ts.SyntaxKind.AnyKeyword
  );
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Prefer `satisfies T` over `as T` on object/array literals (no widening)",
  },
  nodeTypes: [ts.SyntaxKind.AsExpression],
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isAsExpression(node)) return;
      if (
        !ts.isObjectLiteralExpression(node.expression) &&
        !ts.isArrayLiteralExpression(node.expression)
      ) {
        return;
      }
      if (isConstAssertion(node.type)) return;
      if (isUnknownOrAnyType(node.type)) return;

      const targetType = ctx.checker.getTypeFromTypeNode(node.type);
      if (targetType.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return;

      // Delegate to unnecessary-type-assertion: bidirectional assignable → `as` is fully redundant
      const exprType = ctx.checker.getTypeAtLocation(node.expression);
      if (
        isAssignableTo(ctx.checker, exprType, targetType) &&
        isAssignableTo(ctx.checker, targetType, exprType)
      ) {
        return;
      }

      const typeText = node.type.getText(ctx.sourceFile);
      ctx.reportAt(
        node.type,
        `Use 'satisfies ${typeText}' instead of 'as ${typeText}' — preserves literal precision`,
        {
          action: "prefer-satisfies",
          pattern: `Replace 'as ${typeText}' with 'satisfies ${typeText}' - keeps literal precision`,
          reference: "https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator",
          fix: ctx.createFix(node, `${node.expression.getText(ctx.sourceFile)} satisfies ${typeText}`),
        },
      );
    });
  },
});
