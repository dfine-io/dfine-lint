// Flags unsafe types in template literal ${} expressions.
// Only allows primitives and types with own toString() implementation.
// Prevents [object Object] interpolation in user-facing strings and logs.
import ts from "typescript";
import { defineRule, hasOwnToString, isNodeModulesDeclaration } from "@dfine-io-gmbh/dlint";

const SAFE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.Number |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.BigIntLiteral |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.TemplateLiteral;

export default defineRule({
  meta: {
    category: "quality",
    description: "Unsafe types in template literal expressions",
  },
  check(ctx) {
    function isSafeForTemplate(type: ts.Type): boolean {
      if (type.flags & SAFE_FLAGS) return true;
      if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
      if (type.flags & ts.TypeFlags.EnumLiteral) return true;
      if (type.isUnion()) return type.types.every((t) => isSafeForTemplate(t));
      if (type.isIntersection())
        return type.types.some((t) => isSafeForTemplate(t));
      if (hasOwnToString(type, ctx.checker)) return true;
      if (isThirdPartyType(type)) return true;
      return false;
    }

    function isThirdPartyType(type: ts.Type): boolean {
      const sym = type.symbol ?? type.aliasSymbol;
      return !!sym && isNodeModulesDeclaration(sym);
    }

    ctx.walk((node) => {
      if (!ts.isTemplateExpression(node)) return;
      for (const span of node.templateSpans) {
        const type = ctx.checker.getTypeAtLocation(span.expression);
        if (!isSafeForTemplate(type)) {
          ctx.reportAt(
            span.expression,
            `Wrap '${ctx.checker.typeToString(type)}' with String() or .toString() in template literal`,
            {
              action: "stringify",
              pattern: "Wrap the expression with String()",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals",
              fix: ctx.createFix(span.expression, "String(" + span.expression.getText(ctx.sourceFile) + ")"),
            }
          );
        }
      }
    });
  },
});
