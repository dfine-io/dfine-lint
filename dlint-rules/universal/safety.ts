// Detects safety issues: unchecked optional chaining results, nullish coalescing
// with non-nullable types, and unsafe type narrowing patterns.
// Safety issues compile but can cause runtime null/undefined errors.
import ts from "typescript";
import { defineRule, isLibDeclaration, isWriteTarget, resolveCallee, valueSymbolOf } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const ARRAY_CALLBACK_METHODS_REQUIRING_RETURN = new Set(["map", "filter", "find", "findIndex", "every", "some", "reduce", "flatMap"]);
// ===========================================================================

// The executor's second parameter rejects, whatever it is called: new Promise((res, fail) => fail("x"))
function isPromiseRejectParam(id: ts.Identifier, checker: ts.TypeChecker): boolean {
  const sym = checker.getSymbolAtLocation(id);
  if (!sym?.valueDeclaration || !ts.isParameter(sym.valueDeclaration)) return false;
  const fn = sym.valueDeclaration.parent;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  // A `this` parameter is a type annotation, not a position
  const params = fn.parameters.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this"));
  if (params.indexOf(sym.valueDeclaration) !== 1) return false;
  if (!ts.isNewExpression(fn.parent) || fn.parent.arguments?.[0] !== fn) return false;
  const ctor = resolveCallee(fn.parent, checker);
  return !!ctor?.lib && ctor.name === "Promise";
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
      const callee = ts.isCallExpression(node) || ts.isNewExpression(node) ? resolveCallee(node, ctx.checker) : undefined;
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

      // 2 + 4. Promise executor of the lib Promise (globalThis.Promise and aliases too): no returned value, no async
      const executor = ts.isNewExpression(node) ? node.arguments?.[0] : undefined;
      if (callee?.lib && callee.name === "Promise" && executor && (ts.isArrowFunction(executor) || ts.isFunctionExpression(executor))) {
        if (ts.isBlock(executor.body)) {
          for (const stmt of executor.body.statements) {
            if (!ts.isReturnStatement(stmt) || !stmt.expression) continue;
            ctx.reportAt(stmt, "Promise executor should not return a value — use resolve()/reject()", {
              action: "use-resolve", pattern: "resolve(value) instead of return value",
            });
          }
        }
        if (ts.getCombinedModifierFlags(executor) & ts.ModifierFlags.Async) {
          ctx.reportAt(executor, "Remove async from Promise executor -- errors won't reject", {
            action: "remove-async", pattern: "Remove async from executor, use resolve/reject explicitly",
          });
        }
      }

      // 3. no-unsafe-optional-chaining — ?. in arithmetic where result is nullable (TypeChecker-verified)
      if (ts.isBinaryExpression(node)) {
        const isArithmetic = node.operatorToken.kind >= ts.SyntaxKind.PlusToken &&
          node.operatorToken.kind <= ts.SyntaxKind.PercentToken;
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
        // = and == are no arithmetic: only this check skips them, require-atomic-updates below still runs
        if (isArithmetic) {
          checkSide(node.left);
          checkSide(node.right);
        }
      }

      // 5. require-atomic-updates — a variable of an outer function read before an await and written after it
      if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const sym = ctx.checker.getSymbolAtLocation(node.left);
        const fn = ts.findAncestor(node.parent, ts.isFunctionLike);
        // A compound assignment reads its target before the right side runs
        const compound = node.operatorToken.kind !== ts.SyntaxKind.EqualsToken;
        const outer = !!sym?.valueDeclaration && !!fn && !ts.findAncestor(sym.valueDeclaration, (n) => n === fn);
        if (sym && outer && readsBeforeAwait(node.right, sym, compound, ctx.checker)) {
          ctx.reportAt(node, `'${node.left.text}' is read before the await and written after it -- a concurrent update is lost`, {
            action: "read-after-await", pattern: `const value = await ...; ${node.left.text} += value;`,
          });
        }
      }

      // 6. radix — parseInt or Number.parseInt without radix; no early return, later checks still run
      if (ts.isCallExpression(node) && node.arguments.length === 1 && callee?.lib && callee.name === "parseInt") {
        ctx.reportAt(node, "parseInt requires radix argument", {
          action: "add-radix", pattern: "parseInt(str, 10)",
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
          // A write only: assignment, ++/--, destructuring or a for-in/of head; a comparison or !x reads
          if (ts.isIdentifier(n) && isWriteTarget(n) && valueSymbolOf(n, ctx.checker) === condSym) { modified = true; return; }
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
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length > 0 &&
          isPromiseRejectParam(node.expression, ctx.checker)) {
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
        // A lib array method only: Bus.map(cb) on a project class expects no return value
        if (!callee?.lib || !arrayCallbackMethods.has(callee.name)) return;
        const method = callee.name;
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

// True when the symbol is read before the last await of the expression resumes; nested functions run later
function readsBeforeAwait(expr: ts.Expression, sym: ts.Symbol, readsFirst: boolean, checker: ts.TypeChecker): boolean {
  let firstRead = readsFirst ? expr.pos : Infinity;
  let lastResume = -1;
  const walk = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isAwaitExpression(n)) lastResume = Math.max(lastResume, n.end);
    if (ts.isIdentifier(n) && valueSymbolOf(n, checker) === sym) firstRead = Math.min(firstRead, n.getStart());
    ts.forEachChild(n, walk);
  };
  walk(expr);
  return firstRead < lastResume;
}
