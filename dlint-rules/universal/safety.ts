// Detects safety issues: unchecked optional chaining results, nullish coalescing
// with non-nullable types, and unsafe type narrowing patterns.
// Safety issues compile but can cause runtime null/undefined errors.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const ARRAY_CALLBACK_METHODS_REQUIRING_RETURN = new Set(["map", "filter", "find", "findIndex", "every", "some", "reduce", "flatMap"]);
// ===========================================================================

function isPromiseExecutorParam(id: ts.Identifier, checker: ts.TypeChecker): boolean {
  const sym = checker.getSymbolAtLocation(id);
  if (!sym?.valueDeclaration || !ts.isParameter(sym.valueDeclaration)) return false;
  const fn = sym.valueDeclaration.parent;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  if (!ts.isNewExpression(fn.parent) || !ts.isIdentifier(fn.parent.expression)) return false;
  const ctorSym = checker.getSymbolAtLocation(fn.parent.expression);
  return !!ctorSym && isLibDeclaration(ctorSym);
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Safety patterns: constructor-return, promise-executor, atomic-updates, radix",
    subChecks: 9,
  },
  check(ctx) {
    const arrayCallbackMethods = ctx.options.arrayCallbackMethods ? new Set(ctx.options.arrayCallbackMethods as string[]) : ARRAY_CALLBACK_METHODS_REQUIRING_RETURN;

    ctx.walk((node) => {
      // 1. no-constructor-return — return value in constructor
      if (ts.isConstructorDeclaration(node) && node.body) {
        for (const stmt of node.body.statements) {
          if (!ts.isReturnStatement(stmt)) continue;
          if (!stmt.expression) continue;
          ctx.reportAt(stmt, "Remove return from constructor -- return value is ignored", {
            action: "remove-return", pattern: "Remove return statement from constructor",
          });
        }
      }

      // 2. no-promise-executor-return — return in Promise executor
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!sym || !isLibDeclaration(sym) || node.expression.text !== "Promise") return;
        const executor = node.arguments?.[0];
        if (!executor || (!ts.isArrowFunction(executor) && !ts.isFunctionExpression(executor))) return;
        if (!executor.body || !ts.isBlock(executor.body)) return;
        for (const stmt of executor.body.statements) {
          if (!ts.isReturnStatement(stmt) || !stmt.expression) continue;
          ctx.reportAt(stmt, "Promise executor should not return a value — use resolve()/reject()", {
            action: "use-resolve", pattern: "resolve(value) instead of return value",
          });
        }
      }

      // 3. no-unsafe-optional-chaining — ?. in arithmetic where result is nullable (TypeChecker-verified)
      if (ts.isBinaryExpression(node)) {
        const isArithmetic = node.operatorToken.kind >= ts.SyntaxKind.PlusToken &&
          node.operatorToken.kind <= ts.SyntaxKind.PercentToken;
        if (!isArithmetic) return;
        const isUnsafeOptionalChain = (n: ts.Node): boolean => {
          if (ts.isPropertyAccessExpression(n) && n.questionDotToken) return true;
          if (ts.isCallExpression(n) && n.questionDotToken) return true;
          if (ts.isElementAccessExpression(n) && n.questionDotToken) return true;
          return false;
        };
        const checkSide = (n: ts.Node): void => {
          if (!isUnsafeOptionalChain(n)) return;
          const sideType = ctx.checker.getTypeAtLocation(n);
          if (sideType.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) {
            ctx.reportAt(node, "Add null check before arithmetic -- optional chain may produce undefined", {
              action: "add-nullcheck", pattern: "Check for undefined before arithmetic operation",
            });
            return;
          }
          if (sideType.isUnion() && sideType.types.some(t => t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) {
            ctx.reportAt(node, "Add null check before arithmetic -- optional chain may produce undefined", {
              action: "add-nullcheck", pattern: "Check for undefined before arithmetic operation",
            });
          }
        };
        checkSide(node.left);
        checkSide(node.right);
      }

      // 4. no-async-promise-executor — async function as Promise executor
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!sym || !isLibDeclaration(sym) || node.expression.text !== "Promise") return;
        const executor = node.arguments?.[0];
        if (!executor) return;
        const isAsync = (ts.isArrowFunction(executor) || ts.isFunctionExpression(executor)) &&
          !!(ts.getCombinedModifierFlags(executor) & ts.ModifierFlags.Async);
        if (!isAsync) return;
        ctx.reportAt(executor, "Remove async from Promise executor -- errors won't reject", {
          action: "remove-async", pattern: "Remove async from executor, use resolve/reject explicitly",
        });
      }

      // 5. require-atomic-updates — await in assignment to outer variable
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(node.left) && ts.isAwaitExpression(node.right)) {
        const sym = ctx.checker.getSymbolAtLocation(node.left);
        if (!sym?.valueDeclaration) return;
        const declParent = sym.valueDeclaration.parent;
        const assignParent = node.parent;
        if (declParent !== assignParent && !isDescendant(assignParent, declParent)) {
          ctx.reportAt(node, "Store await result in local variable -- outer assignment may race", {
            action: "use-local", pattern: "const result = await ...; outerVar = result;",
          });
        }
      }

      // 6. radix — parseInt without radix argument
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length === 1) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!sym || !isLibDeclaration(sym)) return;
        if (node.expression.text !== "parseInt") return;
        const radixTarget = node.arguments[0];
        if (!radixTarget) return;
        ctx.reportAt(node, "parseInt requires radix argument", {
          action: "add-radix", pattern: "parseInt(str, 10)",
          fix: ctx.insertAfter(radixTarget, ", 10"),
        });
      }

      // 7. no-unmodified-loop-condition — loop condition variable never changes
      if ((ts.isWhileStatement(node) || ts.isDoStatement(node)) && node.expression) {
        if (!ts.isIdentifier(node.expression)) return;
        const condSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!condSym) return;
        let modified = false;
        function checkModification(n: ts.Node): void {
          if (modified) return;
          if (ts.isBinaryExpression(n) && ts.isIdentifier(n.left)) {
            const sym = ctx.checker.getSymbolAtLocation(n.left);
            if (sym === condSym) { modified = true; return; }
          }
          if (ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) {
            if (ts.isIdentifier(n.operand)) {
              const sym = ctx.checker.getSymbolAtLocation(n.operand);
              if (sym === condSym) { modified = true; return; }
            }
          }
          ts.forEachChild(n, checkModification);
        }
        checkModification(node.statement);
        if (!modified) {
          ctx.reportAt(node.expression, "Update loop condition variable inside loop body -- currently never modified", {
            action: "fix-loop", pattern: "Ensure loop variable is updated or use a different exit condition",
          });
        }
      }

      // 8. prefer-promise-reject-errors — reject() with non-Error argument
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "reject" && node.arguments.length > 0) {
        if (!isPromiseExecutorParam(node.expression, ctx.checker)) return;
        const arg = node.arguments[0];
        if (!arg) return;
        if (ts.isStringLiteral(arg) || ts.isNumericLiteral(arg) || ts.isTemplateExpression(arg) ||
            ts.isNoSubstitutionTemplateLiteral(arg)) {
          ctx.reportAt(node, "Use Error object in Promise.reject()", {
            action: "wrap-error", pattern: "reject(new Error('message')) instead of reject('message')",
          });
        }
      }

      // 9. array-callback-return — map/filter/find/etc. without return
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (!arrayCallbackMethods.has(method)) return;
        if (node.arguments.length === 0) return;
        const callback = node.arguments[0];
        if (!callback) return;
        if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return;
        if (!ts.isBlock(callback.body)) return;
        const hasReturn = hasNestedReturn(callback.body);
        // Async callback returning Promise<void> — intentional void for Promise collection
        if (!hasReturn && isAsyncVoidCallback(callback, ctx.checker)) return;
        if (hasReturn) return;
        ctx.reportAt(callback, `Array.${method}() callback must return a value`, {
          action: "add-return", pattern: `arr.${method}(x => { return ...; })`,
        });
      }

    });
  },
});

function isAsyncVoidCallback(callback: ts.ArrowFunction | ts.FunctionExpression, checker: ts.TypeChecker): boolean {
  if (!(ts.getCombinedModifierFlags(callback) & ts.ModifierFlags.Async)) return false;
  const sigs = checker.getTypeAtLocation(callback).getCallSignatures();
  const sig0 = sigs[0];
  if (!sig0) return false;
  const returnType = checker.getReturnTypeOfSignature(sig0);
  if (!(returnType.flags & ts.TypeFlags.Object)) return false;
  if (!((returnType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)) return false;
  const typeRef = returnType as ts.TypeReference;
  if (!typeRef.target.symbol || !isLibDeclaration(typeRef.target.symbol)) return false;
  const typeArgs = checker.getTypeArguments(typeRef);
  const firstArg = typeArgs[0];
  return typeArgs.length === 1 && firstArg !== undefined && !!(firstArg.flags & ts.TypeFlags.Void);
}

function hasNestedReturn(block: ts.Block): boolean {
  let found = false;
  function walk(n: ts.Node): void {
    if (found) return;
    if (ts.isReturnStatement(n)) { found = true; return; }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) return;
    ts.forEachChild(n, walk);
  }
  ts.forEachChild(block, walk);
  return found;
}

function isDescendant(child: ts.Node, parent: ts.Node): boolean {
  let current = child.parent;
  while (current) {
    if (current === parent) return true;
    current = current.parent;
  }
  return false;
}
