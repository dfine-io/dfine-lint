// Enforces React Rules of Hooks: hooks must be called at the top level of
// components/custom hooks — never inside conditions, loops, or after early returns.
import ts from "typescript";
import { defineRule, isInsideLoop, isTypeFromPackage, resolveCallee, unwrapPromiseType, resolveCallBody, type ResolvedCallee } from "@dfine-io-gmbh/dlint";

// React's hook-name rule: "use" plus a capital letter or digit (userAgent is no hook); react's own use() is checked apart
const HOOK_NAME = /^use[A-Z0-9]/;
// React's naming: a PascalCase function is a component, unless it sits inside a component or hook (then a callback)
const COMPONENT_NAME = /^[A-Z]/;
// React's element types: a function returning one of them is a component (same list in no-async-client-component)
const REACT_ELEMENT_TYPES = new Set(["Element", "ReactElement", "ReactNode", "ReactPortal"]);

function isJsxReturnType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const unwrapped = unwrapPromiseType(type, checker);
  const parts = unwrapped.isUnion() && !unwrapped.aliasSymbol ? unwrapped.types : [unwrapped];
  return parts.some((t) => {
    const sym = t.aliasSymbol ?? t.getSymbol();
    return !!sym && REACT_ELEMENT_TYPES.has(sym.name) && isTypeFromPackage(t, checker, "react");
  });
}

// A hook a package declares (React built-ins, zustand's useStore), react's use() included
function isPackageHook(callee: ResolvedCallee): boolean {
  if (callee.packageName === undefined) return false;
  return HOOK_NAME.test(callee.name) || (callee.packageName === "react" && callee.name === "use");
}

// Package hook calls directly in a body (not in nested functions), per body: every hook call in it reuses the walk
const packageHookCalls = new WeakMap<ts.Node, readonly ts.CallExpression[]>();
function packageHookCallsIn(body: ts.Node, checker: ts.TypeChecker): readonly ts.CallExpression[] {
  const cached = packageHookCalls.get(body);
  if (cached) return cached;
  const calls: ts.CallExpression[] = [];
  function visit(n: ts.Node): void {
    const callee = ts.isCallExpression(n) ? resolveCallee(n, checker) : undefined;
    if (callee && ts.isCallExpression(n) && isPackageHook(callee)) calls.push(n);
    if (!isFunctionScope(n)) ts.forEachChild(n, visit);
  }
  ts.forEachChild(body, visit);
  packageHookCalls.set(body, calls);
  return calls;
}

// The hook a call invokes: a package hook, or a project use* function whose body calls one
function hookCallee(node: ts.CallExpression, checker: ts.TypeChecker): ResolvedCallee | undefined {
  const callee = resolveCallee(node, checker);
  if (!callee) return undefined;
  if (isPackageHook(callee)) return callee;
  // A project use* function is a hook only when its body calls a package hook
  if (!HOOK_NAME.test(callee.name)) return undefined;
  const body = resolveCallBody(checker, node);
  return body && packageHookCallsIn(body, checker).length > 0 ? callee : undefined;
}

// Every function form starts its own scope for hooks and returns: methods, accessors and constructors too
function isFunctionScope(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isAccessor(node) || ts.isConstructorDeclaration(node);
}

function getEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  return ts.findAncestor(node.parent, isFunctionScope);
}

// The name a function goes by: its own, or the variable it is assigned to
function functionName(fn: ts.FunctionLikeDeclaration): string {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : "";
}

// A component returns a React element; a named component or hook calls a package hook, any other function one more
function isComponentOrHook(fn: ts.FunctionLikeDeclaration, checker: ts.TypeChecker, except?: ts.Node): boolean {
  const sig = checker.getSignatureFromDeclaration(fn);
  if (sig) {
    const returnType = checker.getReturnTypeOfSignature(sig);
    if (isJsxReturnType(returnType, checker)) return true;
  }
  if (!fn.body) return false;
  const calls = packageHookCallsIn(fn.body, checker);
  const name = functionName(fn);
  const outer = getEnclosingFunction(fn);
  const named = HOOK_NAME.test(name) || (COMPONENT_NAME.test(name) && !(outer && isComponentOrHook(outer, checker)));
  return named ? calls.length > 0 : calls.some((call) => call !== except);
}

// onlyTry: react's use() may run in conditions; only a try/catch around it breaks the rules
function isConditionallyExecuted(node: ts.Node, boundary: ts.Node, onlyTry: boolean): boolean {
  let current: ts.Node = node;
  while (current && current !== boundary) {
    const parent = current.parent;
    if (!parent) break;
    // if/else branch
    if (!onlyTry &&
      ts.isIfStatement(parent) &&
      (current === parent.thenStatement || current === parent.elseStatement)
    ) {
      return true;
    }
    // switch case
    if (!onlyTry && (ts.isCaseClause(current) || ts.isDefaultClause(current))) return true;
    // ternary branch
    if (!onlyTry &&
      ts.isConditionalExpression(parent) &&
      (current === parent.whenTrue || current === parent.whenFalse)
    ) {
      return true;
    }
    // short-circuit RHS (a && hook(), a || hook(), a ?? hook())
    if (!onlyTry && ts.isBinaryExpression(parent) && current === parent.right) {
      const op = parent.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return true;
      }
    }
    // try/catch (for use())
    if (
      ts.isTryStatement(parent) &&
      (current === parent.tryBlock || current === parent.catchClause)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

function containsReturn(node: ts.Node): boolean {
  if (ts.isReturnStatement(node)) return true;
  // Don't descend into nested functions
  if (isFunctionScope(node)) return false;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found) found = containsReturn(child);
  });
  return found;
}

function hasEarlyReturnBefore(
  hookCall: ts.Node,
  boundary: ts.FunctionLikeDeclaration,
): boolean {
  if (!boundary.body || !ts.isBlock(boundary.body)) return false;
  for (const stmt of boundary.body.statements) {
    if (stmt.pos >= hookCall.pos) break;
    // Skip statements that CONTAIN the hook call (return useHook())
    if (stmt.end > hookCall.pos) continue;
    if (containsReturn(stmt)) return true;
  }
  return false;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "React hooks must be called at top level — not in conditions, loops, or after early returns",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      const hook = hookCallee(node, ctx.checker);
      if (!hook) return;
      const hookName = hook.name;
      // react's use() may sit in conditions, loops and after returns; top level and try/catch still apply
      const isUse = hook.packageName === "react" && hook.name === "use";
      const enclosing = getEnclosingFunction(node);

      if (!enclosing) {
        ctx.reportAt(
          node,
          `Move ${hookName} inside a component or custom hook -- called at module top level`,
          { action: "move-to-component", pattern: "Call hooks inside a React component or custom hook function", reference: "https://react.dev/reference/rules/rules-of-hooks" },
        );
        return;
      }

      // A class member is never a function component or hook, whatever it returns
      if (ts.isClassLike(enclosing.parent)) {
        ctx.reportAt(
          node,
          `Move ${hookName} out of the class -- hooks run only in function components and custom hooks`,
          { action: "move-to-component", pattern: "Call hooks inside a function component or custom hook", reference: "https://react.dev/reference/rules/rules-of-hooks" },
        );
        return;
      }

      if (!isComponentOrHook(enclosing, ctx.checker, node)) {
        // Check if enclosing is a nested callback inside a component
        const outerFn = getEnclosingFunction(enclosing);
        if (outerFn && isComponentOrHook(outerFn, ctx.checker)) {
          ctx.reportAt(
            node,
            `Move ${hookName} to component top level -- hooks cannot be called inside callbacks`,
            { action: "extract-hook", pattern: "Move hook call to the component/hook top level" },
          );
        }
        return;
      }

      if (!isUse && isInsideLoop(node)) {
        ctx.reportAt(
          node,
          `Extract ${hookName} out of loop -- hooks must be called in the same order every render`,
          { action: "remove-loop", pattern: "Extract loop body to a separate component" },
        );
        return;
      }

      if (isConditionallyExecuted(node, enclosing, isUse)) {
        ctx.reportAt(
          node,
          `Move ${hookName} before the condition -- hooks must be called in the same order every render`,
          { action: "remove-condition", pattern: "Move hook before the condition, use the value conditionally instead" },
        );
        return;
      }

      if (!isUse && hasEarlyReturnBefore(node, enclosing)) {
        ctx.reportAt(
          node,
          `Move ${hookName} before any return statements -- hooks must be called in the same order every render`,
          { action: "move-before-return", pattern: "Move hook call before any return statements" },
        );
      }
    });
  },
});
