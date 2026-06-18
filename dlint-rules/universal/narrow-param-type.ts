// Narrow function parameter types to what's actually consumed.
// Sub-checks:
//   1. usage-ratio: param type has >=10 props but <25% accessed
//   2. partial-type-param: `x: Partial<T>` in signature with only a few fields touched
// Exempts pass-through, destructured rest, external types, and callbacks.
import ts from "typescript";
import {
  defineRule,
  isLibDeclaration,
  isNodeModulesDeclaration,
  isBuiltinCollection,
} from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_PROPERTIES = 10;
const USAGE_THRESHOLD = 0.25;
const PARTIAL_PICK_MAX_FIELDS = 5;
// ===========================================================================

function isPartialTypeNode(typeNode: ts.TypeNode | undefined): typeNode is ts.TypeReferenceNode {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return false;
  if (!ts.isIdentifier(typeNode.typeName)) return false;
  if (typeNode.typeName.text !== "Partial") return false;
  return (typeNode.typeArguments?.length ?? 0) === 1;
}

/** Type declaration is external (lib.d.ts, node_modules) — developer cannot narrow */
function isExternalType(paramType: ts.Type): boolean {
  const symbol = paramType.getSymbol() ?? paramType.aliasSymbol;
  if (!symbol) return false;
  return isLibDeclaration(symbol) || isNodeModulesDeclaration(symbol);
}

/** Function is a callback — param type imposed by caller, not developer's choice */
function isCallbackArgument(fn: ts.Node): boolean {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  // Direct call argument: foo((s) => ...), arr.map((c) => ...)
  if (ts.isCallExpression(fn.parent) && fn.parent.arguments.some((a) => a === fn)) return true;
  // Object property callback: { cell: ({ row }) => ... } (TanStack column defs, config objects)
  if (ts.isPropertyAssignment(fn.parent)) return true;
  return false;
}

function collectUsedProps(
  paramSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  node: ts.Node,
  used: Set<string>
): void {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression)
  ) {
    const sym = checker.getSymbolAtLocation(node.expression);
    if (sym === paramSymbol) used.add(node.name.text);
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    ts.isIdentifier(node.initializer)
  ) {
    const sym = checker.getSymbolAtLocation(node.initializer);
    if (sym === paramSymbol) {
      for (const el of node.name.elements) {
        if (ts.isBindingElement(el) && !el.dotDotDotToken && ts.isIdentifier(el.name)) {
          used.add(
            el.propertyName && (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName))
              ? el.propertyName.text
              : el.name.text
          );
        }
      }
    }
  }
  ts.forEachChild(node, (child) =>
    collectUsedProps(paramSymbol, checker, child, used)
  );
}

function isPassedThrough(
  paramSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  body: ts.Node
): boolean {
  let passed = false;
  function check(node: ts.Node): void {
    if (passed) return;
    // Array/call spread: ...param
    if (
      ts.isSpreadElement(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const sym = checker.getSymbolAtLocation(node.expression);
      if (sym === paramSymbol) { passed = true; return; }
    }
    // Object spread: {...param}
    if (
      ts.isSpreadAssignment(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const sym = checker.getSymbolAtLocation(node.expression);
      if (sym === paramSymbol) { passed = true; return; }
    }
    // Return: return param (full object leaves function)
    if (
      ts.isReturnStatement(node) && node.expression &&
      ts.isIdentifier(node.expression)
    ) {
      const sym = checker.getSymbolAtLocation(node.expression);
      if (sym === paramSymbol) { passed = true; return; }
    }
    // Destructuring with rest: const { a, ...rest } = param (rest captures all remaining props)
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer && ts.isIdentifier(node.initializer) &&
      node.name.elements.some((el) => ts.isBindingElement(el) && el.dotDotDotToken)
    ) {
      const sym = checker.getSymbolAtLocation(node.initializer);
      if (sym === paramSymbol) { passed = true; return; }
    }
    // Call argument: fn(param)
    if (ts.isCallExpression(node)) {
      for (const arg of node.arguments) {
        if (ts.isIdentifier(arg)) {
          const sym = checker.getSymbolAtLocation(arg);
          if (sym === paramSymbol) { passed = true; return; }
        }
      }
    }
    ts.forEachChild(node, check);
  }
  check(body);
  return passed;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "Narrow function parameter types -- usage-ratio + partial-type-param",
    subChecks: 2,
  },
  check(ctx) {
    const minProperties = (ctx.options.minProperties as number) ?? MIN_PROPERTIES;
    const usageThreshold = (ctx.options.usageThreshold as number) ?? USAGE_THRESHOLD;
    const partialPickMaxFields = (ctx.options.partialPickMaxFields as number) ?? PARTIAL_PICK_MAX_FIELDS;
    ctx.walk((node) => {
      if (
        !(
          ts.isFunctionDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node) ||
          ts.isMethodDeclaration(node)
        ) ||
        !node.body
      )
        return;

      // Skip: callback argument — param type imposed by caller (store selectors, .map, etc.)
      if (isCallbackArgument(node)) return;

      for (const param of node.parameters) {
        if (!ts.isIdentifier(param.name)) continue;
        const paramName = param.name.text;

        const paramSymbol = ctx.checker.getSymbolAtLocation(param.name);
        if (!paramSymbol) continue;

        // --- Sub-check 2: partial-type-param ---
        if (
          isPartialTypeNode(param.type) &&
          !ctx.isSubCheckDisabled("partial-type-param")
        ) {
          const innerTypeArg = (param.type as ts.TypeReferenceNode).typeArguments?.[0];
          if (!innerTypeArg) continue;
          const innerType = ctx.checker.getTypeFromTypeNode(innerTypeArg);
          const innerProps = innerType.getProperties();
          if (innerProps.length > 0 && node.body && !isPassedThrough(paramSymbol, ctx.checker, node.body)) {
            const used = new Set<string>();
            collectUsedProps(paramSymbol, ctx.checker, node.body, used);
            if (used.size > 0 && used.size <= partialPickMaxFields && used.size < innerProps.length) {
              const inner = innerTypeArg.getText(ctx.sourceFile);
              ctx.reportAt(
                param,
                `Replace 'Partial<${inner}>' on '${paramName}' with 'Pick<${inner}, ${[...used].map((p) => `"${p}"`).join(" | ")}>'`,
                {
                  action: "use-pick-over-partial",
                  pattern: "Use Pick<T, K> instead of Partial<T> - it states exactly which fields matter",
                  reference: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
                },
              );
              continue;
            }
          }
        }

        // --- Sub-check 1: usage-ratio ---
        if (ctx.isSubCheckDisabled("usage-ratio")) continue;

        const rawType = ctx.checker.getTypeAtLocation(param);
        const paramType = ctx.checker.getApparentType(rawType);
        if (
          paramType.flags &
          (ts.TypeFlags.Any |
            ts.TypeFlags.Unknown |
            ts.TypeFlags.String |
            ts.TypeFlags.Number |
            ts.TypeFlags.Boolean)
        )
          continue;
        if (paramType.isUnion()) continue;

        // Skip: external type (DOM, library, built-in) — cannot be narrowed by developer
        if (isExternalType(paramType)) continue;

        // Skip: built-in collections — prototype property count is meaningless
        if (isBuiltinCollection(paramType, ctx.checker)) continue;

        // Skip: branded intersections — array (SortedVersions = T[] & { __brand }) or primitive (HexColor = string & { __brand }).
        // Uses rawType because getApparentType() unwraps `string & {__brand}` to the String object type (loses intersection shape).
        if (rawType.isIntersection()) {
          const intersectionTypes = (rawType as ts.IntersectionType).types;
          if (intersectionTypes.some((t) => isBuiltinCollection(t, ctx.checker))) continue;
          if (
            intersectionTypes.some(
              (t) => t.flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean)
            )
          )
            continue;
        }

        const allProps = paramType.getProperties();
        if (allProps.length < minProperties) continue;
        if (node.body && isPassedThrough(paramSymbol, ctx.checker, node.body))
          continue;

        const usedProps = new Set<string>();
        if (node.body)
          collectUsedProps(paramSymbol, ctx.checker, node.body, usedProps);
        const ratio = usedProps.size / allProps.length;
        if (ratio < usageThreshold && usedProps.size > 0) {
          ctx.reportAt(
            param,
            `Narrow parameter '${paramName}' type -- uses ${usedProps.size}/${allProps.length} properties (${Math.round(ratio * 100)}%)`,
            {
              action: "narrow-type",
              pattern: "Use Pick<Type, K> or destructure only needed properties",
              reference: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
            }
          );
        }
      }
    });
  },
});
