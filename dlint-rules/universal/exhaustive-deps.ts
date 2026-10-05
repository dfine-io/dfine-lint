// Enforces exhaustive dependency arrays for useEffect, useCallback, useMemo.
// Uses TypeChecker to resolve symbols and detect stable values (useState setter, useRef, etc).
import ts from "typescript";
import {
  defineRule,
  resolveCallee,
  resolveSymbol,
  valueSymbolOf,
} from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const HOOKS_WITH_DEPS = new Set(["useEffect", "useCallback", "useMemo"]);

// Hooks whose 2nd destructured element is identity-stable per React guarantees (same list as react.ts STATE_HOOKS)
const STABLE_SETTER_HOOKS = new Set([
  "useState",
  "useReducer",
  "useTransition",
  "useActionState",
]);

// Hooks whose return value is identity-stable
const STABLE_VALUE_HOOKS = new Set(["useRef", "useId"]);
// ===========================================================================

function isStableHookValue(
  decl: ts.Declaration,
  checker: ts.TypeChecker,
  stableSetterHooks: Set<string>,
  stableValueHooks: Set<string>,
): boolean {
  /* Array destructuring: const [state, setter] = useState(...) */
  if (ts.isBindingElement(decl) && ts.isArrayBindingPattern(decl.parent)) {
    const index = decl.parent.elements.indexOf(decl);
    const varDecl = decl.parent.parent;
    if (
      ts.isVariableDeclaration(varDecl) &&
      varDecl.initializer &&
      ts.isCallExpression(varDecl.initializer)
    ) {
      const callee = resolveCallee(varDecl.initializer, checker);
      if (callee?.packageName === "react" && index === 1) {
        return stableSetterHooks.has(callee.name);
      }
    }
  }

  /* Direct assignment: const ref = useRef(...) */
  if (
    ts.isVariableDeclaration(decl) &&
    decl.initializer &&
    ts.isCallExpression(decl.initializer)
  ) {
    const callee = resolveCallee(decl.initializer, checker);
    if (callee?.packageName === "react") {
      return stableValueHooks.has(callee.name);
    }
  }

  /* Const with literal value: const MAX = 5, const label = "hello", const flag = true */
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const parent = decl.parent;
    if (ts.isVariableDeclarationList(parent) && parent.flags & ts.NodeFlags.Const) {
      const init = decl.initializer;
      if (
        ts.isNumericLiteral(init) ||
        ts.isStringLiteral(init) ||
        init.kind === ts.SyntaxKind.TrueKeyword ||
        init.kind === ts.SyntaxKind.FalseKeyword ||
        init.kind === ts.SyntaxKind.NullKeyword
      ) {
        return true;
      }
    }
  }

  return false;
}

// const fn = useCallback(() => { fn(); }, []): the callback reads the variable it is assigned to
function isSelfReference(valueDecl: ts.Node, callback: ts.Node): boolean {
  let parent = callback.parent;
  if (ts.isCallExpression(parent)) parent = parent.parent;
  return valueDecl === parent;
}

// The function the hook runs in: a component or hook, an expression-bodied one (x => useMemo(...)) included
function getComponentBoundary(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    )
      return current;
    current = current.parent;
  }
  return undefined;
}

function isDeclaredBetween(
  decl: ts.Node,
  outer: ts.Node,
  inner: ts.Node,
): boolean {
  let parent: ts.Node | undefined = decl;
  while (parent) {
    if (parent === inner) return false; // Local to callback
    if (parent === outer) return true; // In component scope
    parent = parent.parent;
  }
  return false; // Module level or global
}

function isSkippableIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;
  // Property name in member access: obj.prop → skip prop
  if (ts.isPropertyAccessExpression(parent) && parent.name === node)
    return true;
  // Binding element name
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  // Parameter name
  if (ts.isParameter(parent) && parent.name === node) return true;
  // Function declaration name
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  // Variable declaration name
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  // JSX attribute name
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  // Type reference
  if (ts.isTypeReferenceNode(parent)) return true;
  // Import specifier
  if (ts.isImportSpecifier(parent)) return true;
  // Property assignment name: { key: value } → skip key
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  // A shorthand { key } reads the variable, so it is never skipped
  return false;
}

function collectCallbackDeps(
  callback: ts.Node,
  componentFn: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
  stableSetterHooks: Set<string>,
  stableValueHooks: Set<string>,
): Set<string> {
  const deps = new Set<string>();

  function visit(n: ts.Node): void {
    if (ts.isIdentifier(n)) {
      if (isSkippableIdentifier(n)) {
        ts.forEachChild(n, visit);
        return;
      }

      const sym = valueSymbolOf(n, checker);
      if (!sym) {
        ts.forEachChild(n, visit);
        return;
      }
      const resolved = resolveSymbol(checker, sym);

      const valueDecl =
        resolved.valueDeclaration ?? resolved.declarations?.[0];
      if (!valueDecl) {
        ts.forEachChild(n, visit);
        return;
      }

      /* Must be declared in component scope */
      if (!isDeclaredBetween(valueDecl, componentFn, callback)) {
        ts.forEachChild(n, visit);
        return;
      }

      /* Skip identity-stable hook values */
      if (isStableHookValue(valueDecl, checker, stableSetterHooks, stableValueHooks)) {
        ts.forEachChild(n, visit);
        return;
      }

      /* Skip self-reference (const fn = useCallback(() => fn(), [])) */
      if (isSelfReference(valueDecl, callback)) {
        ts.forEachChild(n, visit);
        return;
      }

      deps.add(n.text);
    }
    ts.forEachChild(n, visit);
  }

  visit(callback);
  return deps;
}

function getRootIdentifier(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return getRootIdentifier(node.expression);
  // Non-null assertion: config!.accesses → root is config
  if (ts.isNonNullExpression(node)) return getRootIdentifier(node.expression);
  return null;
}

function getDeclaredDeps(depsNode: ts.ArrayLiteralExpression): Set<string> {
  const deps = new Set<string>();
  for (const el of depsNode.elements) {
    const root = getRootIdentifier(el);
    if (root) deps.add(root);
  }
  return deps;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "useEffect/useCallback/useMemo dependency arrays must include all reactive values",
  },
  check(ctx) {
    const hooksWithDeps = ctx.options.hooksWithDeps ? new Set(ctx.options.hooksWithDeps as string[]) : HOOKS_WITH_DEPS;
    const stableSetterHooks = ctx.options.stableSetterHooks ? new Set(ctx.options.stableSetterHooks as string[]) : STABLE_SETTER_HOOKS;
    const stableValueHooks = ctx.options.stableValueHooks ? new Set(ctx.options.stableValueHooks as string[]) : STABLE_VALUE_HOOKS;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      const hook = resolveCallee(node, ctx.checker);
      if (hook?.packageName !== "react" || !hooksWithDeps.has(hook.name)) return;
      const hookName = hook.name;

      const callback = node.arguments[0];
      if (
        !callback ||
        (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
      )
        return;

      const depsArg = node.arguments[1];
      if (!depsArg || !ts.isArrayLiteralExpression(depsArg)) return;

      const componentFn = getComponentBoundary(node);
      if (!componentFn) return;

      const actualDeps = collectCallbackDeps(
        callback,
        componentFn,
        ctx.checker,
        stableSetterHooks,
        stableValueHooks,
      );
      const declaredDeps = getDeclaredDeps(depsArg);

      const missing = [...actualDeps].filter((d) => !declaredDeps.has(d));
      if (missing.length > 0) {
        ctx.reportAt(
          depsArg,
          `Add missing deps to ${hookName}: ${missing.join(", ")}`,
          {
            action: "add-missing-deps",
            pattern: `Add [${missing.join(", ")}] to the dependency array`,
            reference: "https://react.dev/reference/react/useEffect",
          },
        );
      }
    });
  },
});
