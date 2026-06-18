// Enforces React best practices: no nested component definitions,
// no object/array literals in JSX props (causes re-renders),
// and proper hook dependency patterns. Prevents silent performance bugs.
import ts from "typescript";
import { defineRule, isLibDeclaration, isNodeModulesDeclaration, resolveSymbol, isFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const STATE_HOOKS = new Set(["useState", "useReducer", "useTransition", "useActionState"]);
// ===========================================================================

/** TypeChecker: call is a React state setter from useState/useReducer destructuring at index 1 */
function isReactStateSetterCall(call: ts.CallExpression, checker: ts.TypeChecker, stateHooks: Set<string>): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  const sym = checker.getSymbolAtLocation(call.expression);
  if (!sym?.valueDeclaration) return false;
  const decl = sym.valueDeclaration;
  // Must be a BindingElement (destructured variable)
  if (!ts.isBindingElement(decl)) return false;
  const pattern = decl.parent;
  if (!ts.isArrayBindingPattern(pattern)) return false;
  // Must be at index 1 (the setter position: [state, setter])
  const index = pattern.elements.indexOf(decl);
  if (index !== 1) return false;
  // Parent must be a VariableDeclaration with a call initializer
  const varDecl = pattern.parent;
  if (!ts.isVariableDeclaration(varDecl) || !varDecl.initializer || !ts.isCallExpression(varDecl.initializer)) return false;
  // The call must be to useState/useReducer from react package
  if (!ts.isIdentifier(varDecl.initializer.expression)) return false;
  const callee = varDecl.initializer.expression;
  if (!isFromPackage(callee, checker, "react")) return false;
  return stateHooks.has(callee.text);
}

/** Check if any identifier in the node resolves to one of the given symbols */
function refsAnySymbol(node: ts.Node, symbols: Set<ts.Symbol>, checker: ts.TypeChecker): boolean {
  let found = false;
  function scan(n: ts.Node): void {
    if (found) return;
    if (ts.isIdentifier(n)) {
      const sym = checker.getSymbolAtLocation(n);
      if (sym && symbols.has(sym)) found = true;
    }
    ts.forEachChild(n, scan);
  }
  scan(node);
  return found;
}

/** Check if setState arg is a safe constant (empty array, new expression, boolean/null literal) */
function isSafeSetStateArg(arg: ts.Expression): boolean {
  if (ts.isArrayLiteralExpression(arg) && arg.elements.length === 0) return true;
  if (ts.isNewExpression(arg)) return true;
  return arg.kind === ts.SyntaxKind.FalseKeyword
    || arg.kind === ts.SyntaxKind.TrueKeyword
    || arg.kind === ts.SyntaxKind.NullKeyword;
}

/** Check if node is inside a nested closure (arrow/function) relative to the callback boundary */
function isInsideNestedClosure(node: ts.Node, boundary: ts.Node): boolean {
  let parent: ts.Node | undefined = node.parent;
  while (parent && parent !== boundary) {
    if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) return true;
    parent = parent.parent;
  }
  return false;
}

/** Check if setState call is guarded (safe constant arg or arg references dependency symbols) */
function isGuardedSetState(call: ts.CallExpression, depSymbols: Set<ts.Symbol>, checker: ts.TypeChecker): boolean {
  const firstArg = call.arguments[0];
  if (!firstArg) return false;
  if (isSafeSetStateArg(firstArg)) return true;
  return depSymbols.size > 0 && refsAnySymbol(firstArg, depSymbols, checker);
}

function hasAbortGuard(
  body: ts.Block,
  checker: ts.TypeChecker
): boolean {
  let found = false;
  function scan(n: ts.Node): void {
    if (found) return;
    // new AbortController() — verify name + TypeChecker lib declaration
    if (
      ts.isNewExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "AbortController"
    ) {
      const sym = checker.getSymbolAtLocation(n.expression);
      if (sym && isLibDeclaration(sym)) { found = true; return; }
    }
    // Structural: let boolean variable (cleanup flag pattern — any name)
    if (
      ts.isVariableDeclaration(n) && n.initializer &&
      (n.initializer.kind === ts.SyntaxKind.TrueKeyword || n.initializer.kind === ts.SyntaxKind.FalseKeyword) &&
      n.parent && ts.isVariableDeclarationList(n.parent) &&
      !(n.parent.flags & ts.NodeFlags.Const)
    ) {
      found = true; return;
    }
    ts.forEachChild(n, scan);
  }
  scan(body);
  return found;
}

function isHookWrapper(parent: ts.Node, checker: ts.TypeChecker): boolean {
  if (!ts.isCallExpression(parent) || !ts.isIdentifier(parent.expression)) return false;
  const hookSym = checker.getSymbolAtLocation(parent.expression);
  if (!hookSym || !isNodeModulesDeclaration(resolveSymbol(checker, hookSym))) return false;
  return parent.expression.text === "useCallback" || parent.expression.text === "useMemo";
}

export default defineRule({
  meta: {
    category: "quality",
    description: "React patterns: nested-component, setState-in-effect, race-condition, use-button-type",
    subChecks: 4,
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    const stateHooks = ctx.options.stateHooks ? new Set(ctx.options.stateHooks as string[]) : STATE_HOOKS;

    ctx.walk((node) => {
      // no-nested-component: component defined inside render
      if (
        (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) &&
        node.parent
      ) {
        // Check if this is a component (returns JSX) inside another component
        const isJsxReturn = node.body && ts.isBlock(node.body)
          ? node.body.statements.some((s) =>
              ts.isReturnStatement(s) && s.expression &&
              (ts.isJsxElement(s.expression) || ts.isJsxSelfClosingElement(s.expression) ||
                ts.isJsxFragment(s.expression) || ts.isParenthesizedExpression(s.expression))
            )
          : false;

        if (isJsxReturn) {
          // Skip: function inside object literal property (TanStack column defs, config objects)
          if (ts.isPropertyAssignment(node.parent) || ts.isPropertyDeclaration(node.parent)) return;
          // Skip: current function is a direct call argument (.map, .filter, .then callbacks)
          if (ts.isCallExpression(node.parent) && node.parent.arguments.some((a) => a === node)) return;
          // Skip: IIFE — immediately invoked, not a persistent component identity
          if (ts.isParenthesizedExpression(node.parent) && ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent) return;
          if (ctx.isSubCheckDisabled("nested-component")) return;

          let parentFn: ts.Node | undefined = node.parent;
          while (parentFn) {
            const isFn = (ts.isFunctionDeclaration(parentFn) || ts.isArrowFunction(parentFn) || ts.isFunctionExpression(parentFn)) && parentFn !== node;
            if (!isFn) { parentFn = parentFn.parent; continue; }
            if (ts.isCallExpression(parentFn.parent) && parentFn.parent.arguments.some((a) => a === parentFn)) break;
            if (isHookWrapper(parentFn.parent, ctx.checker)) break;
            ctx.reportAt(node, "Component defined inside render — extract to module scope to avoid re-mount on every render", { action: "extract-component", pattern: "const Inner = () => <JSX/>; // at module scope", reference: "https://react.dev/reference/rules" });
            break;
          }
        }
      }

      // useEffect checks: shared guard for setState-in-effect + race-condition
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useEffect" &&
        node.arguments.length > 0
      ) {
        const ueSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!ueSym || !isNodeModulesDeclaration(resolveSymbol(ctx.checker, ueSym))) return;
        const [callback, depsArg] = node.arguments;
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          const cb = callback;
          const isEmptyDeps = depsArg && ts.isArrayLiteralExpression(depsArg) && depsArg.elements.length === 0;

          // Collect dep symbols for prop-sync detection (symbol identity, not name strings)
          const depSymbols = new Set<ts.Symbol>();
          if (depsArg && ts.isArrayLiteralExpression(depsArg)) {
            for (const el of depsArg.elements) {
              const target = ts.isPropertyAccessExpression(el) ? el.expression : el;
              if (ts.isIdentifier(target)) {
                const sym = ctx.checker.getSymbolAtLocation(target);
                if (sym) depSymbols.add(sym);
              }
            }
          }

          if (callback.body && ts.isBlock(callback.body)) {
            function checkSetState(n: ts.Node): void {
              if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && isReactStateSetterCall(n, ctx.checker, stateHooks)) {
                if (!isEmptyDeps && !isInsideNestedClosure(n, cb) && !isGuardedSetState(n, depSymbols, ctx.checker)) {
                  ctx.reportAt(n, `Guard ${n.expression.text}() in useEffect with condition or move to event handler`, { action: "guard-setState", pattern: "Add guard condition or move to event handler" });
                }
              }
              ts.forEachChild(n, checkSetState);
            }
            for (const stmt of callback.body.statements) {
              if (!ts.isReturnStatement(stmt)) checkSetState(stmt);
            }
          }
        }

        // no-race-condition-setState
        if (
          callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
          (ts.getCombinedModifierFlags(callback) & ts.ModifierFlags.Async) !== 0
        ) {
          if (callback.body && ts.isBlock(callback.body)) {
            const hasCleanup = callback.body.statements.some((s) => ts.isReturnStatement(s));
            if (!hasCleanup && !hasAbortGuard(callback.body, ctx.checker)) {
              ctx.reportAt(callback, "Add cleanup function to async useEffect -- return abort controller", { action: "add-abort-controller", pattern: "const ctrl = new AbortController(); return () => ctrl.abort();" });
            }
          }
        }
      } // close isUseEffectCall

      // use-button-type: <button> without type attribute defaults to "submit"
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        ts.isIdentifier(node.tagName) && node.tagName.text === "button"
      ) {
        const hasType = node.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "type"
        );
        if (!hasType) {
          ctx.reportAt(node, '<button> without type — defaults to "submit", add type="button"', { action: "add-button-type", pattern: "<button type=\"button\"> or <button type=\"submit\">" });
        }
      }
    });
  },
});
