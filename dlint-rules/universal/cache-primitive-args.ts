// Ensures React.cache() receives only primitive arguments (string, number, boolean).
// Primitive equality via === guarantees correct cache deduplication.
// Objects/arrays use reference equality — identical-looking objects cause cache misses.
// Branded types (string & $brand<T>) are runtime primitives and pass this check.
import ts from "typescript";
import { defineRule, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

const PRIMITIVE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.Number |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined;

function isPrimitiveType(type: ts.Type): boolean {
  if (type.flags & PRIMITIVE_FLAGS) return true;
  if (type.isUnion()) return type.types.every((t) => isPrimitiveType(t));
  if (type.isIntersection()) return type.types.some((t) => isPrimitiveType(t));
  return false;
}

export default defineRule({
  meta: {
    category: "performance",
    description: "React.cache primitive args only",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "cache"
      ) {
        const cacheSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!cacheSym || !isNodeModulesDeclaration(resolveSymbol(ctx.checker, cacheSym))) return;
        const arg = node.arguments[0];
        if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
          for (const param of arg.parameters) {
            const type = ctx.checker.getTypeAtLocation(param);
            if (type.flags & ts.TypeFlags.Any) continue;
            if (!isPrimitiveType(type)) {
              ctx.reportAt(
                param,
                `Replace cache arg '${ts.isIdentifier(param.name) ? param.name.text : "(destructured)"}': ${ctx.checker.typeToString(type)} with a primitive type`,
                {
                  action: "refactor-args",
                  pattern: "Pass primitive args only - use an object ID",
                  reference: "https://react.dev/reference/react/cache",
                }
              );
            }
          }
        }
      }
    });
  },
});
