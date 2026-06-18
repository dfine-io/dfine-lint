// Flags unnecessary `as Type` assertions where types are already mutually assignable.
// Skips `as const` and any/unknown types. Unnecessary assertions mask real type issues.
// Non-null assertions (!) are handled by typescript.ts blanket ban — no overlap.
import ts from "typescript";
import { defineRule, isAssignableTo } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Unnecessary type assertion — type is already correct",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (ts.isAsExpression(node)) {
        if (
          ts.isTypeReferenceNode(node.type) &&
          ts.isIdentifier(node.type.typeName) &&
          node.type.typeName.text === "const"
        )
          return;
        const exprType = ctx.checker.getTypeAtLocation(node.expression);
        const assertedType = ctx.checker.getTypeAtLocation(node);
        if (
          exprType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) ||
          assertedType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)
        )
          return;
        if (
          isAssignableTo(ctx.checker, exprType, assertedType) &&
          isAssignableTo(ctx.checker, assertedType, exprType)
        ) {
          const assertedStr = ctx.checker.typeToString(assertedType);
          ctx.reportAt(
            node,
            `Unnecessary 'as ${assertedStr}' — expression is already '${assertedStr}'`,
            {
              action: "remove-assertion",
              pattern: "Remove the 'as Type' assertion",
              reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions",
              fix: ctx.createFix(node, node.expression.getText(ctx.sourceFile)),
            }
          );
        }
      }
    });
  },
});
