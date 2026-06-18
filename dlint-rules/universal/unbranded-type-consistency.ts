// Flags branded-type consistency violations:
// 1. named-id: *Id declarations typed as plain string
// 2. container-key: Map<string,V> / Set<string> methods with branded keys
// 3. record-key: Record<string,V> indexed with branded keys
// Skips: callback params, type-aliased annotations, node_modules types.
import ts from "typescript";
import { defineRule, isNodeModulesDeclaration, isLibDeclaration } from "@dfine-io-gmbh/dlint";

const ID_SUFFIX = /[a-z]Id$/;
const CONTAINER_KEY_METHODS = new Set(["set", "get", "has", "add", "delete"]);

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
// Default allow-list of *Id names NOT to flag (external API ids). Override per project via
// config ruleOptions["unbranded-type-consistency"] = { externalIdNames: ["deviceId", ...] }.
const EXTERNAL_ID_NAMES = new Set<string>([]);
// ===========================================================================

function isPlainString(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.String) return true;
  if (type.isUnion()) {
    return type.types.some(
      (t) => t.flags & ts.TypeFlags.String && !(t.flags & ts.TypeFlags.StringLiteral),
    );
  }
  return false;
}

function isBrandedString(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  return type.types.some((t) => t.flags & ts.TypeFlags.String) &&
    type.types.some((t) => t.flags & ts.TypeFlags.Object);
}

function hasTypeAlias(node: ts.Node & { type?: ts.TypeNode }, checker: ts.TypeChecker): boolean {
  if (!node.type) return false;
  const annotated = checker.getTypeFromTypeNode(node.type);
  if (annotated.aliasSymbol) return true;
  if (annotated.isIntersection()) return true;
  return false;
}

function isCallbackParam(node: ts.ParameterDeclaration): boolean {
  const fn = node.parent;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  if (ts.isCallExpression(fn.parent) && fn.parent.arguments.some((a) => a === fn)) return true;
  if (ts.isPropertyAssignment(fn.parent)) return true;
  return false;
}

function isExternalDeclaration(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (ts.isPropertySignature(node)) {
    const parentSym = node.parent && checker.getSymbolAtLocation(node.parent.parent);
    if (parentSym && isNodeModulesDeclaration(parentSym)) return true;
  }
  return false;
}

function isNextJsPageParam(node: ts.PropertySignature): boolean {
  let current: ts.Node = node.parent;
  while (current) {
    if (ts.isPropertySignature(current) && ts.isIdentifier(current.name)) {
      if (current.name.text === "params" || current.name.text === "searchParams") return true;
    }
    if (ts.isTypeAliasDeclaration(current)) {
      if (current.name.text === "SearchParams" || current.name.text === "RouteParams") return true;
    }
    current = current.parent;
  }
  return false;
}

function getContainerKeyType(
  receiverType: ts.Type,
  checker: ts.TypeChecker,
): { keyType: ts.Type; name: string } | null {
  const sym = receiverType.getSymbol();
  if (!sym || !isLibDeclaration(sym)) return null;
  if (sym.name !== "Map" && sym.name !== "Set") return null;
  if (!(receiverType.flags & ts.TypeFlags.Object)) return null;
  if (!((receiverType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)) return null;
  const typeArgs = checker.getTypeArguments(receiverType as ts.TypeReference);
  const keyType = typeArgs[0];
  if (!keyType) return null;
  return { keyType, name: sym.name };
}

function reportNamedId(ctx: Parameters<Parameters<typeof defineRule>[0]["check"]>[0], node: ts.Node, name: string): void {
  ctx.reportAt(node, `Type '${name}' as a branded type -- plain string is not type-safe`, {
    action: "use-branded-type",
    pattern: "Import a branded id type instead of plain string",
    reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
  });
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Unbranded type in container key or *Id declaration — use branded type",
  },
  check(ctx) {
    const externalIdNames = ctx.options.externalIdNames
      ? new Set(ctx.options.externalIdNames as string[])
      : EXTERNAL_ID_NAMES;
    ctx.walk((node) => {
      // --- Sub-check: named-id — *Id params/properties typed as plain string ---
      if (ts.isParameter(node) && ts.isIdentifier(node.name) && ID_SUFFIX.test(node.name.text)) {
        if (externalIdNames.has(node.name.text)) return;
        if (hasTypeAlias(node, ctx.checker) || isCallbackParam(node)) return;
        if (!isPlainString(ctx.checker.getTypeAtLocation(node.name))) return;
        reportNamedId(ctx, node.name, node.name.text);
        return;
      }

      if (ts.isPropertySignature(node) && ts.isIdentifier(node.name) && ID_SUFFIX.test(node.name.text)) {
        if (externalIdNames.has(node.name.text)) return;
        if (isNextJsPageParam(node)) return;
        if (isExternalDeclaration(node, ctx.checker) || hasTypeAlias(node, ctx.checker)) return;
        if (!node.type || !isPlainString(ctx.checker.getTypeFromTypeNode(node.type))) return;
        reportNamedId(ctx, node.name, node.name.text);
        return;
      }

      if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && ID_SUFFIX.test(node.name.text)) {
        if (hasTypeAlias(node, ctx.checker) || !node.type) return;
        if (!isPlainString(ctx.checker.getTypeFromTypeNode(node.type))) return;
        reportNamedId(ctx, node.name, node.name.text);
        return;
      }

      // --- Sub-check: container-key — Map<string,V>.set(branded) / Set<string>.add(branded) ---
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        CONTAINER_KEY_METHODS.has(node.expression.name.text) &&
        node.arguments.length >= 1 &&
        !ctx.isSubCheckDisabled("container-key")
      ) {
        const receiverType = ctx.checker.getTypeAtLocation(node.expression.expression);
        const container = getContainerKeyType(receiverType, ctx.checker);
        if (!container || !isPlainString(container.keyType)) return;
        const keyArg = node.arguments[0];
        if (!keyArg) return;
        const argType = ctx.checker.getTypeAtLocation(keyArg);
        if (!isBrandedString(argType)) return;
        ctx.reportAt(
          node.expression,
          `Use branded key type in ${container.name}<string, ...>.${node.expression.name.text}() -- receives branded value`,
          { action: "use-branded-key", pattern: "Map<BrandedKey, V> instead of Map<string, V>", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" },
        );
        return;
      }

      // --- Sub-check: record-key — Record<string,V>[brandedKey] ---
      if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        !ctx.isSubCheckDisabled("record-key")
      ) {
        const keyType = ctx.checker.getTypeAtLocation(node.argumentExpression);
        if (!isBrandedString(keyType)) return;
        const objectType = ctx.checker.getTypeAtLocation(node.expression);
        const indexInfos = ctx.checker.getIndexInfosOfType(objectType);
        if (!indexInfos.some((info) => info.keyType.flags & ts.TypeFlags.String)) return;
        ctx.reportAt(
          node.expression,
          "Use branded key type in Record declaration -- indexed with branded key but declared as string",
          { action: "use-branded-key", pattern: "Record<BrandedKey, V> instead of Record<string, V>", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" },
        );
      }
    });
  },
});
