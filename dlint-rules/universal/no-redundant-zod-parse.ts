// Flags redundant Zod .parse / .safeParse calls where the argument is already
// branded / narrowly typed to the schema's output. The input must NOT
// originate from a trust boundary (string / unknown / any) — those are legit parses.
// Structural Zod detection: receiver type exposes both `parse` and `safeParse` methods.
import ts from "typescript";
import { defineRule, isAssignableTo, hasDirective } from "@dfine-io-gmbh/dlint";

const WIDELY_TYPED_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Any |
  ts.TypeFlags.BigInt;

function isBrandedIntersection(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  const hasPrimitive = type.types.some((t) => t.flags & (ts.TypeFlags.String | ts.TypeFlags.Number));
  const hasObject = type.types.some((t) => t.flags & ts.TypeFlags.Object);
  return hasPrimitive && hasObject;
}

function typeContainsWidelyTyped(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type> = new Set()): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  // Brand is narrow, not widely typed
  if (isBrandedIntersection(type)) return false;
  if (type.flags & WIDELY_TYPED_FLAGS) return true;
  if (type.isUnion()) {
    return type.types.some((t) => typeContainsWidelyTyped(t, checker, seen));
  }
  if (type.isIntersection()) {
    // Non-branded intersection: widely if any member is widely
    return type.types.some((t) => typeContainsWidelyTyped(t, checker, seen));
  }
  // Type references (Array<T>, Record<K,V>, etc.) — scan type arguments
  if ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArgs.some((t) => typeContainsWidelyTyped(t, checker, seen))) return true;
  }
  // Record/index signatures — any value type that is widely-typed counts
  const indexInfos = checker.getIndexInfosOfType(type);
  if (indexInfos.some((info) => typeContainsWidelyTyped(info.type, checker, seen))) return true;
  return false;
}

function isZodSchemaReceiver(receiverType: ts.Type): boolean {
  return !!receiverType.getProperty("parse") && !!receiverType.getProperty("safeParse");
}

// Walks the receiver chain of `.parse(x)` and returns true when any upstream call
// is `.catch(fallback)`. That chain is an explicit defensive re-validation (a
// JSONB / 3rd-party SDK boundary pattern), so the parse is load-bearing even when
// the argument's TypeScript type already matches the schema output.
function receiverChainHasCatch(receiver: ts.Expression): boolean {
  let current: ts.Expression = receiver;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    if (current.expression.name.text === "catch") return true;
    current = current.expression.expression;
  }
  return false;
}

function unwrapSafeParseReturn(returnType: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  if (!returnType.isUnion()) return null;
  for (const variant of returnType.types) {
    const successSym = variant.getProperty("success");
    const dataSym = variant.getProperty("data");
    if (!successSym || !dataSym) continue;
    const dataDecl = dataSym.declarations?.[0];
    if (!dataDecl) continue;
    const successDecl = successSym.declarations?.[0] ?? dataDecl;
    const successType = checker.getTypeOfSymbolAtLocation(successSym, successDecl);
    if (!(successType.flags & ts.TypeFlags.BooleanLiteral)) continue;
    if (checker.typeToString(successType) !== "true") continue;
    return checker.getTypeOfSymbolAtLocation(dataSym, dataDecl);
  }
  return null;
}

function getSchemaOutputType(
  call: ts.CallExpression,
  methodName: "parse" | "safeParse",
  checker: ts.TypeChecker,
): ts.Type | null {
  const sig = checker.getResolvedSignature(call);
  if (!sig) return null;
  const returnType = sig.getReturnType();
  if (methodName === "parse") return returnType;
  return unwrapSafeParseReturn(returnType, checker);
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "Redundant Zod parse — argument already narrowly typed to schema output (no re-validation inside trust boundary)",
  },
  nodeTypes: [ts.SyntaxKind.CallExpression],
  check(ctx) {
    // Server Action files are trust boundaries — all parses are boundary-validation
    if (hasDirective(ctx.sourceFile, "use server")) return;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      if (!ts.isPropertyAccessExpression(node.expression)) return;
      const methodName = node.expression.name.text;
      if (methodName !== "parse" && methodName !== "safeParse") return;
      if (node.arguments.length === 0) return;

      const receiverType = ctx.checker.getTypeAtLocation(node.expression.expression);
      if (!isZodSchemaReceiver(receiverType)) return;

      // Defensive re-validation via `.catch(fallback)` is a legitimate trust-boundary pattern (JSONB / SDK output)
      if (receiverChainHasCatch(node.expression.expression)) return;

      const outputType = getSchemaOutputType(node, methodName, ctx.checker);
      if (!outputType) return;

      const argNode = node.arguments[0];
      if (!argNode) return;
      const argType = ctx.checker.getTypeAtLocation(argNode);

      // Trust-boundary: if argument carries a widely-typed member, parsing is legit
      if (typeContainsWidelyTyped(argType, ctx.checker)) return;

      // Argument must be assignable to schema output (same brand / narrower)
      if (!isAssignableTo(ctx.checker, argType, outputType)) return;

      const argTypeStr = ctx.checker.typeToString(argType);
      const outTypeStr = ctx.checker.typeToString(outputType);
      ctx.reportAt(
        node.expression.name,
        `Redundant Zod ${methodName}() — argument already typed '${argTypeStr}', matches schema output '${outTypeStr}'`,
        {
          action: "drop-redundant-parse",
          pattern:
            "Pass the branded value directly - re-parse only at trust boundaries",
        },
      );
    });
  },
});
