// Flags `{ ... } as T` / `[ ... ] as T` on object/array literals where `satisfies T`
// would preserve literal precision without widening.
// Skips: `as const`, `as unknown`, expressions whose source type is unknown/any (boundary),
// and fully-redundant assertions (handled by universal/unnecessary-type-assertion).
import ts from "typescript";
import { defineRule, isAssignableTo } from "@dfine-io-gmbh/dlint";

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
      if (ts.isConstTypeReference(node.type)) return;

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
        },
      );
    });
  },
});
