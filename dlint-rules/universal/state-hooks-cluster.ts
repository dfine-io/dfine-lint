// Flags useState anti-patterns that must be encoded as discriminated unions.
// 4 sub-checks, all structural: boolean-with-coupled-ref (setter + ref.current co-written
// in same callback body), multiple-nullable-state, status-plus-nullable, state-cluster-count.
// TypeChecker + Symbol-Resolution only, no name regexes.
import ts from "typescript";
import {
  defineRule,
  isFromPackage,
  isLibDeclaration,
  isNullableType,
} from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================

const STATE_CLUSTER_THRESHOLD = 5;

// ===========================================================================

type HookKind = "useState" | "useReducer" | "useRef";

type HookDecl = {
  hookName: HookKind;
  stateType: ts.Type;
  stateName: string;
  node: ts.CallExpression;
  varDecl: ts.VariableDeclaration;
};

function matchHookKind(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): HookKind | null {
  if (!ts.isIdentifier(call.expression)) return null;
  if (!isFromPackage(call.expression, checker, "react")) return null;
  const text = call.expression.text;
  if (text === "useState" || text === "useReducer" || text === "useRef")
    return text;
  return null;
}

function collectHookDecls(
  fn: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
): HookDecl[] {
  const results: HookDecl[] = [];
  function scan(n: ts.Node): void {
    if (
      n !== fn.body &&
      (ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n))
    )
      return;
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(n.initializer)
    ) {
      const hookName = matchHookKind(n.initializer, checker);
      if (hookName) {
        if (ts.isArrayBindingPattern(n.name) && n.name.elements.length >= 1) {
          const el = n.name.elements[0];
          if (el && ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
            results.push({
              hookName,
              stateType: checker.getTypeAtLocation(el.name),
              stateName: el.name.text,
              node: n.initializer,
              varDecl: n,
            });
          }
        } else if (ts.isIdentifier(n.name)) {
          results.push({
            hookName,
            stateType: checker.getTypeAtLocation(n.name),
            stateName: n.name.text,
            node: n.initializer,
            varDecl: n,
          });
        }
      }
    }
    ts.forEachChild(n, scan);
  }
  if (fn.body) scan(fn.body);
  return results;
}

function getSetterSymbol(
  decl: HookDecl,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  if (!ts.isArrayBindingPattern(decl.varDecl.name)) return null;
  const setterEl = decl.varDecl.name.elements[1];
  if (
    !setterEl ||
    !ts.isBindingElement(setterEl) ||
    !ts.isIdentifier(setterEl.name)
  )
    return null;
  return checker.getSymbolAtLocation(setterEl.name) ?? null;
}

function getRefSymbol(
  decl: HookDecl,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  if (!ts.isIdentifier(decl.varDecl.name)) return null;
  return checker.getSymbolAtLocation(decl.varDecl.name) ?? null;
}

function isBooleanType(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.Boolean) return true;
  if (type.flags & ts.TypeFlags.BooleanLiteral) return true;
  return false;
}

function isDomRef(refDecl: HookDecl): boolean {
  if (refDecl.stateType.isUnion()) {
    return refDecl.stateType.types.some(
      (t) => t.symbol && isLibDeclaration(t.symbol),
    );
  }
  return refDecl.stateType.symbol
    ? isLibDeclaration(refDecl.stateType.symbol)
    : false;
}

function isLiteralStringUnion(type: ts.Type): boolean {
  if (!type.isUnion()) return false;
  return type.types.every((t) => t.isStringLiteral());
}

function hasObjectMember(type: ts.Type): boolean {
  if (!type.isUnion()) return false;
  return type.types.some((t) => Boolean(t.flags & ts.TypeFlags.Object));
}

function calledSetterInBody(
  body: ts.Node,
  setters: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
): boolean {
  let found = false;
  function scan(n: ts.Node): void {
    if (found) return;
    if (
      n !== body &&
      (ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n))
    )
      return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const sym = checker.getSymbolAtLocation(n.expression);
      if (sym && setters.has(sym)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, scan);
  }
  scan(body);
  return found;
}

function wroteRefCurrentInBody(
  body: ts.Node,
  refs: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
): boolean {
  let found = false;
  function scan(n: ts.Node): void {
    if (found) return;
    if (
      n !== body &&
      (ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n))
    )
      return;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === "current" &&
      ts.isIdentifier(n.left.expression)
    ) {
      const sym = checker.getSymbolAtLocation(n.left.expression);
      if (sym && refs.has(sym)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, scan);
  }
  scan(body);
  return found;
}

function hasCoupledCallback(
  fnBody: ts.Node,
  setters: ReadonlySet<ts.Symbol>,
  refs: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
): boolean {
  let coupled = false;
  function walk(n: ts.Node): void {
    if (coupled) return;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.body &&
      ts.isBlock(n.body)
    ) {
      if (
        calledSetterInBody(n.body, setters, checker) &&
        wroteRefCurrentInBody(n.body, refs, checker)
      ) {
        coupled = true;
        return;
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(fnBody);
  return coupled;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "useState anti-patterns that must be discriminated unions: bool+ref coupling, multi-nullable, status+nullable, >=5 useState",
    subChecks: 4,
  },
  check(ctx) {
    const stateClusterThreshold =
      (ctx.options.stateClusterThreshold as number) ?? STATE_CLUSTER_THRESHOLD;

    if (
      !ctx.sourceFile.fileName.endsWith(".tsx") &&
      !ctx.sourceFile.fileName.endsWith(".ts")
    )
      return;

    ctx.walk((node) => {
      if (
        !ts.isFunctionDeclaration(node) &&
        !ts.isArrowFunction(node) &&
        !ts.isFunctionExpression(node)
      )
        return;

      const decls = collectHookDecls(node, ctx.checker);
      if (decls.length === 0) return;

      const states = decls.filter((d) => d.hookName === "useState");
      const refs = decls.filter((d) => d.hookName === "useRef");

      if (!ctx.isSubCheckDisabled("boolean-with-coupled-ref")) {
        const boolStates = states.filter((d) => isBooleanType(d.stateType));
        const nonDomRefs = refs.filter((r) => !isDomRef(r));
        if (boolStates.length > 0 && nonDomRefs.length > 0) {
          const setterSymbols = new Set<ts.Symbol>();
          for (const bs of boolStates) {
            const s = getSetterSymbol(bs, ctx.checker);
            if (s) setterSymbols.add(s);
          }
          const refSymbols = new Set<ts.Symbol>();
          for (const r of nonDomRefs) {
            const s = getRefSymbol(r, ctx.checker);
            if (s) refSymbols.add(s);
          }
          if (
            setterSymbols.size > 0 &&
            refSymbols.size > 0 &&
            node.body &&
            hasCoupledCallback(
              node.body,
              setterSymbols,
              refSymbols,
              ctx.checker,
            )
          ) {
            const first = boolStates[0];
            if (first) {
              ctx.reportAt(
                first.node,
                `useState<boolean> '${first.stateName}' + useRef are co-written in same callback -- fold into discriminated union`,
                {
                  action: "use-discriminated-union",
                  pattern:
                    "type State = {phase:'idle'} | {phase:'loading'; id} | {phase:'loaded'; id; data}",
                },
              );
            }
          }
        }
      }

      if (!ctx.isSubCheckDisabled("multiple-nullable-state")) {
        const nullables = states.filter((d) => isNullableType(d.stateType));
        if (nullables.length >= 2) {
          const first = nullables[0];
          if (first) {
            ctx.reportAt(
              first.node,
              `${nullables.length} nullable useState<T|null> in same scope -- unify into discriminated union`,
              {
                action: "unify-nullable-states",
                pattern:
                  "single useState<{phase:'idle'} | {phase:'loaded'; ...fields}>",
              },
            );
          }
        }
      }

      if (!ctx.isSubCheckDisabled("status-plus-nullable")) {
        const statusStates = states.filter((d) =>
          isLiteralStringUnion(d.stateType),
        );
        const nullableObjects = states.filter(
          (d) => isNullableType(d.stateType) && hasObjectMember(d.stateType),
        );
        if (statusStates.length > 0 && nullableObjects.length > 0) {
          for (const s of statusStates) {
            ctx.reportAt(
              s.node,
              `Status union '${s.stateName}' + nullable data state -- fold data into union variants`,
              {
                action: "fold-into-union",
                pattern:
                  "type State = {status:'idle'} | {status:'loaded'; data: T}",
              },
            );
          }
        }
      }

      if (!ctx.isSubCheckDisabled("state-cluster-count")) {
        if (states.length >= stateClusterThreshold) {
          const first = states[0];
          if (first) {
            ctx.reportAt(
              first.node,
              `${states.length} useState calls in one function -- consider useReducer with discriminated state`,
              {
                action: "use-reducer",
                pattern:
                  "Use useReducer with discriminated state union instead",
                reference: "https://react.dev/reference/react/useReducer",
              },
            );
          }
        }
      }
    });
  },
});
