// Three sub-checks for Zustand store patterns:
// 1. useShallow with single-field object — unnecessary overhead, use direct selector.
// 2. Store read inside useEffect with empty deps — stale value risk, use props instead.
// 3. Multi-field store selector without useShallow — per-field subscription churn.
import ts from "typescript";
import { defineRule, isFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MULTI_FIELD_MIN = 2;
// ===========================================================================

/** TypeChecker: verify type has getState() call signature (Zustand StoreApi) */
function isZustandStoreType(
  identifier: ts.Identifier,
  checker: ts.TypeChecker
): boolean {
  const type = checker.getTypeAtLocation(identifier);
  const getStateProp = type.getProperty("getState");
  if (!getStateProp) return false;
  const gsType = checker.getTypeOfSymbol(getStateProp);
  return gsType.getCallSignatures().length > 0;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Zustand useShallow, store-in-effect, and multi-field-selector patterns",
    subChecks: 3,
  },
  check(ctx) {
    const multiFieldMin = (ctx.options.multiFieldMin as number) ?? MULTI_FIELD_MIN;

    ctx.walk((node) => {
      // Sub-check 1: useShallow with single-field selector
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useShallow" &&
        isFromPackage(node.expression, ctx.checker, "zustand") &&
        node.arguments.length > 0
      ) {
        const [arg] = node.arguments;
        if (!arg) return;
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          const body = arg.body;
          if (
            ts.isParenthesizedExpression(body) ||
            ts.isObjectLiteralExpression(body)
          ) {
            const obj = ts.isParenthesizedExpression(body)
              ? body.expression
              : body;
            if (
              ts.isObjectLiteralExpression(obj) &&
              obj.properties.length === 1
            ) {
              ctx.reportAt(
                node,
                "useShallow with single field — use direct selector instead",
                {
                  action: "simplify-selector",
                  pattern:
                    "const value = useStore((s) => s.field) — no useShallow needed",
                }
              );
            }
          }
        }
      }

      // Sub-check 2: Store selector inside useEffect with empty/stable deps
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useEffect" &&
        isFromPackage(node.expression, ctx.checker, "react") &&
        node.arguments.length >= 2
      ) {
        const [effectBody, depsArg] = node.arguments;
        if (
          depsArg &&
          ts.isArrayLiteralExpression(depsArg) &&
          depsArg.elements.length === 0 &&
          effectBody
        ) {
          if (
            ts.isArrowFunction(effectBody) ||
            ts.isFunctionExpression(effectBody)
          ) {
            // AST-based store READ detection (exclude writes/setters)
            let hasStoreRead = false;
            function findStoreRead(n: ts.Node): void {
              if (hasStoreRead) return;
              // useXxxStore.getState().xxx — only flag reads, not set/cleanup/reset calls
              if (
                ts.isPropertyAccessExpression(n) &&
                n.name.text === "getState" &&
                ts.isIdentifier(n.expression) &&
                isZustandStoreType(n.expression, ctx.checker)
              ) {
                // Check parent: .getState().someAction() is a setter/action, not a read
                const access = n.parent;
                if (
                  ts.isCallExpression(access) &&
                  ts.isPropertyAccessExpression(access.parent) &&
                  ts.isCallExpression(access.parent.parent)
                ) {
                  // useXxxStore.getState().actionName() — this is a write/action, skip
                  return;
                }
                hasStoreRead = true;
                return;
              }
              // useXxxStore(selector) — direct hook call reads state
              if (
                ts.isCallExpression(n) &&
                ts.isIdentifier(n.expression) &&
                isZustandStoreType(n.expression, ctx.checker)
              ) {
                hasStoreRead = true;
                return;
              }
              ts.forEachChild(n, findStoreRead);
            }
            findStoreRead(effectBody.body);
            if (hasStoreRead) {
              ctx.reportAt(
                node,
                "Store read in once-run useEffect — pass as prop instead",
                {
                  action: "pass-as-prop",
                  pattern:
                    "Pass store value as component prop — effects with [] deps won't re-run on store changes",
                }
              );
            }
          }
        }
      }

      // Sub-check 3: Multi-field store selector without useShallow
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        isZustandStoreType(node.expression, ctx.checker) &&
        node.arguments.length >= 1 &&
        !ctx.isSubCheckDisabled("multi-field-selector-without-shallow")
      ) {
        const [selector] = node.arguments;
        if (
          selector &&
          (ts.isArrowFunction(selector) || ts.isFunctionExpression(selector))
        ) {
          const inner = ts.isParenthesizedExpression(selector.body)
            ? selector.body.expression
            : selector.body;
          if (
            ts.isObjectLiteralExpression(inner) &&
            inner.properties.length >= multiFieldMin
          ) {
            ctx.reportAt(
              node.expression,
              `Multi-field store selector without useShallow — wraps ${inner.properties.length} fields causing per-field re-renders`,
              {
                action: "wrap-with-useshallow",
                pattern:
                  "Wrap the selector with useShallow to prevent per-field re-renders - useStore(useShallow((s) => ({ a: s.a, b: s.b })))",
              }
            );
          }
        }
      }
    });
  },
});
