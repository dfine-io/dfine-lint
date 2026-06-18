// Every exported Server Action with user-constructible object params must call Zod
// .safeParse() before business logic. Branded IDs, primitives, and library types
// (Request, Headers) are not user-constructible.
import ts from "typescript";
import {
  defineRule,
  hasDirective,
  getExportedFunctions,
  resolveCallBody,
} from "@dfine-io-gmbh/dlint";

const PRIMITIVE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never |
  ts.TypeFlags.ESSymbol |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.BigIntLiteral;

function isBrandedType(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  return (
    type.types.some(
      (t) => t.flags & (ts.TypeFlags.String | ts.TypeFlags.Number),
    ) && type.types.some((t) => t.flags & ts.TypeFlags.Object)
  );
}

function isLibraryType(type: ts.Type): boolean {
  const sym = type.getSymbol() ?? type.aliasSymbol;
  if (!sym?.declarations?.length) return false;
  return sym.declarations.every((d) => d.getSourceFile().isDeclarationFile);
}

function isSafeType(type: ts.Type): boolean {
  if (type.flags & PRIMITIVE_FLAGS) return true;
  if (isBrandedType(type)) return true;
  if (isLibraryType(type)) return true;
  return false;
}

/** Check if an object type's properties are all safe (branded, primitive, library) */
function isObjectWithSafeProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (!(type.flags & ts.TypeFlags.Object)) return false;
  const props = type.getProperties();
  if (props.length === 0) return true;
  return props.every((prop) => {
    const propType = checker.getTypeOfSymbol(prop);
    return isLeafSafe(propType, checker);
  });
}

/** Recursively check if a type is safe — primitives, branded, library, or objects of safe fields */
function isLeafSafe(type: ts.Type, checker: ts.TypeChecker): boolean {
  const resolved = checker.getNonNullableType(type);
  if (resolved.flags & PRIMITIVE_FLAGS) return true;
  if (isBrandedType(resolved)) return true;
  if (isLibraryType(resolved)) return true;
  if (resolved.isUnion())
    return resolved.types.every((t) => isLeafSafe(t, checker));
  // Array<safe> is safe
  if (checker.isArrayType(resolved)) {
    const typeArgs = checker.getTypeArguments(resolved as ts.TypeReference);
    return typeArgs.length > 0 && typeArgs.every((t) => isLeafSafe(t, checker));
  }
  return false;
}

/** Does this function have at least one param that is a user-constructible object? */
function hasUserConstructibleParam(
  params: readonly ts.ParameterDeclaration[],
  checker: ts.TypeChecker,
): boolean {
  return params.some((p) => {
    const type = checker.getTypeAtLocation(p);
    if (isSafeType(type)) return false;
    if (isObjectWithSafeProperties(type, checker)) return false;
    if (type.isUnion()) {
      return type.types.some((t) => {
        if (isSafeType(t)) return false;
        if (isObjectWithSafeProperties(t, checker)) return false;
        return true;
      });
    }
    if (type.flags & ts.TypeFlags.Object) return true;
    return false;
  });
}

/** Structural: receiver has parse + safeParse methods (Zod schema shape) */
function isZodSafeParseCall(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "safeParse") return false;
  const receiverType = checker.getTypeAtLocation(node.expression.expression);
  return (
    !!receiverType.getProperty("parse") &&
    !!receiverType.getProperty("safeParse")
  );
}

function bodyHasSafeParse(body: ts.Node, checker: ts.TypeChecker): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (isZodSafeParseCall(node, checker)) {
      found = true;
      return;
    }
    // One-level delegation: called function body contains safeParse
    if (ts.isCallExpression(node)) {
      const targetBody = resolveCallBody(checker, node);
      if (targetBody) {
        let delegated = false;
        function scan(n: ts.Node): void {
          if (delegated) return;
          if (isZodSafeParseCall(n, checker)) {
            delegated = true;
            return;
          }
          ts.forEachChild(n, scan);
        }
        scan(targetBody);
        if (delegated) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

export default defineRule({
  meta: {
    category: "security",
    description: "Input validation — Zod safeParse on Server Action params",
  },
  check(ctx) {
    if (!hasDirective(ctx.sourceFile, "use server")) return;

    for (const fn of getExportedFunctions(ctx.sourceFile, ctx.checker)) {
      if (!fn.name || !ts.isIdentifier(fn.name) || !fn.body) continue;
      if (!hasUserConstructibleParam(fn.parameters, ctx.checker)) continue;
      if (bodyHasSafeParse(fn.body, ctx.checker)) continue;

      ctx.reportAt(
        fn.name,
        `Add Zod safeParse to ${fn.name.text} -- params are unsanitized`,
        {
          action: "add-validation",
          pattern:
            "Validate params with Schema.safeParse and return on failure",
          reference:
            "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html",
        },
      );
    }
  },
});
