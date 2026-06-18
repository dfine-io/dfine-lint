// Enforces React Rules of Hooks: hooks must be called at the top level of
// components/custom hooks — never inside conditions, loops, or after early returns.
// Uses TypeChecker to verify React hook origin, isInsideLoop from SDK.
import ts from "typescript";
import { defineRule, isInsideLoop, isFromPackage, unwrapPromiseType, resolveCallBody } from "@dfine-io-gmbh/dlint";

function isJsxReturnType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const unwrapped = unwrapPromiseType(type, checker);
  if (unwrapped.isUnion()) return unwrapped.types.some(t => isJsxReturnType(t, checker));
  if (unwrapped.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return false;
  const props = unwrapped.getProperties();
  return props.some(p => p.name === "type") && props.some(p => p.name === "props") && props.some(p => p.name === "key");
}

function bodyContainsReactHook(body: ts.Node, checker: ts.TypeChecker): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && isFromPackage(n.expression, checker, "react")) {
      found = true; return;
    }
    if (!ts.isArrowFunction(n) && !ts.isFunctionExpression(n)) ts.forEachChild(n, visit);
  }
  ts.forEachChild(body, visit);
  return found;
}

function isHookCall(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(node.expression)) return false;
  const name = node.expression.text;
  // React hooks follow the "use" naming convention (useState, useEffect, useContext, etc.)
  // Factory functions (createContext, createElement, forwardRef, memo, lazy) are NOT hooks
  if (!name.startsWith("use")) return false;
  // React built-in hooks: verified via package resolution
  if (isFromPackage(node.expression, checker, "react")) return true;
  // Local custom hooks: resolve body, check if it calls React hooks
  const body = resolveCallBody(checker, node);
  if (!body) return false;
  return bodyContainsReactHook(body, checker);
}

function getEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function isComponentOrHook(fn: ts.FunctionLikeDeclaration, checker: ts.TypeChecker): boolean {
  const sig = checker.getSignatureFromDeclaration(fn);
  if (sig) {
    const returnType = checker.getReturnTypeOfSignature(sig);
    if (isJsxReturnType(returnType, checker)) return true;
  }
  if (!fn.body) return false;
  return bodyContainsReactHook(fn.body, checker);
}

function isConditionallyExecuted(node: ts.Node, boundary: ts.Node): boolean {
  let current: ts.Node = node;
  while (current && current !== boundary) {
    const parent = current.parent;
    if (!parent) break;
    // if/else branch
    if (
      ts.isIfStatement(parent) &&
      (current === parent.thenStatement || current === parent.elseStatement)
    ) {
      return true;
    }
    // switch case
    if (ts.isCaseClause(current) || ts.isDefaultClause(current)) return true;
    // ternary branch
    if (
      ts.isConditionalExpression(parent) &&
      (current === parent.whenTrue || current === parent.whenFalse)
    ) {
      return true;
    }
    // short-circuit RHS (a && hook(), a || hook(), a ?? hook())
    if (ts.isBinaryExpression(parent) && current === parent.right) {
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
    // Stop at nested function boundary
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current)
    ) {
      break;
    }
    current = parent;
  }
  return false;
}

function containsReturn(node: ts.Node): boolean {
  if (ts.isReturnStatement(node)) return true;
  // Don't descend into nested functions
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return false;
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
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      if (!isHookCall(node, ctx.checker)) return;
      if (!ts.isIdentifier(node.expression)) return;

      const callee = node.expression;
      const hookName = callee.text;
      const enclosing = getEnclosingFunction(node);

      if (!enclosing) {
        ctx.reportAt(
          node,
          `Move ${hookName} inside a component or custom hook -- called at module top level`,
          { action: "move-to-component", pattern: "Call hooks inside a React component or custom hook function", reference: "https://react.dev/reference/rules/rules-of-hooks" },
        );
        return;
      }

      if (!isComponentOrHook(enclosing, ctx.checker)) {
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

      if (isInsideLoop(node)) {
        ctx.reportAt(
          node,
          `Extract ${hookName} out of loop -- hooks must be called in the same order every render`,
          { action: "remove-loop", pattern: "Extract loop body to a separate component" },
        );
        return;
      }

      if (isConditionallyExecuted(node, enclosing)) {
        ctx.reportAt(
          node,
          `Move ${hookName} before the condition -- hooks must be called in the same order every render`,
          { action: "remove-condition", pattern: "Move hook before the condition, use the value conditionally instead" },
        );
        return;
      }

      if (hasEarlyReturnBefore(node, enclosing)) {
        ctx.reportAt(
          node,
          `Move ${hookName} before any return statements -- hooks must be called in the same order every render`,
          { action: "move-before-return", pattern: "Move hook call before any return statements" },
        );
      }
    });
  },
});
