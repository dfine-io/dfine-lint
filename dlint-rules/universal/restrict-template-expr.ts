// Flags unsafe types in template literal ${} expressions.
// Only allows primitives and types with own toString() implementation.
// Prevents [object Object] interpolation in user-facing strings and logs.
import ts from "typescript";
import { defineRule, hasOwnToString, isStringType } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Unsafe types in template literal expressions",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isTemplateExpression(node)) return;
      // A tag gets the values themselves (sql`...` builds a query); only a tag returning a string, like String.raw, stringifies them
      if (ts.isTaggedTemplateExpression(node.parent)) {
        const returned = ctx.checker.getResolvedSignature(node.parent)?.getReturnType();
        if (!returned || !isStringType(returned)) return;
      }
      for (const span of node.templateSpans) {
        const type = ctx.checker.getTypeAtLocation(span.expression);
        // Same answer as no-base-to-string: a package type without its own toString() prints [object Object] too
        if (!hasOwnToString(type, ctx.checker)) {
          ctx.reportAt(
            span.expression,
            `Format '${ctx.checker.typeToString(type)}' explicitly in template literal: it has no own toString()`,
            {
              action: "stringify",
              pattern: "Interpolate a field, or give the type its own toString()",
              reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals",
            }
          );
        }
      }
    });
  },
});
