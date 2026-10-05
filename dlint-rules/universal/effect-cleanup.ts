// Ensures an effect cleans up what it starts: listeners, intervals, timeouts, observers, emitter handlers.
// A setup pairs with its cleanup on the same receiver, also when a project helper runs the cleanup.
// A receiver mismatch counts only when both receivers are known; a bare call and every call inside a helper have
// an unknown receiver, which matches any. Known gap: a helper that cleans up another target (document instead of
// window) passes. Each helper body is walked once per cleanup; a walk that met recursion is partial and is not
// reused by another effect.
import ts from "typescript";
import { defineRule, isSameReference, resolveCallBody, resolveCallee } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const CLEANUP_MAP: Record<string, readonly string[]> = {
  addEventListener: ["removeEventListener"],
  setInterval: ["clearInterval"],
  setTimeout: ["clearTimeout"],
  observe: ["disconnect", "unobserve"],
  on: ["off", "removeListener"],
};
// ===========================================================================

type ApiCall = { method: string; receiver: ts.Expression | undefined };

// The cleanup methods a project helper body calls, per body: a helper's receivers are unknown, so names suffice
const helperCalls = new WeakMap<ts.Node, ReadonlySet<string>>();

type Walk = { stack: Set<ts.Node>; done: Map<ts.Node, ReadonlySet<string>> };

// API calls by resolved name, project helpers followed (see the header for the walk and its cache)
function findCalls(
  node: ts.Node, names: ReadonlySet<string>, checker: ts.TypeChecker, follow: boolean,
  walk: Walk = { stack: new Set(), done: new Map() }, frame = { cut: false },
): ApiCall[] {
  const found: ApiCall[] = [];
  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const callee = resolveCallee(n, checker);
      // The lib or a package declares an API call; any other callee is a project helper worth following
      const isApi = !!callee && (callee.lib || callee.packageName !== undefined);
      if (callee && isApi && names.has(callee.name)) {
        found.push({ method: callee.name, receiver: ts.isPropertyAccessExpression(n.expression) ? n.expression.expression : undefined });
      } else if (callee && !isApi && follow) {
        const body = resolveCallBody(checker, n);
        if (body && walk.stack.has(body)) frame.cut = true;
        else if (body) {
          const cached = helperCalls.get(body);
          let inner = cached ?? walk.done.get(body);
          if (!inner) {
            const own = { cut: false };
            walk.stack.add(body);
            inner = new Set(findCalls(body, names, checker, follow, walk, own).map((c) => c.method));
            walk.stack.delete(body);
            walk.done.set(body, inner);
            if (own.cut) frame.cut = true;
            else helperCalls.set(body, inner);
          } else if (!cached) {
            // A partial result of this walk keeps its caller partial too
            frame.cut = true;
          }
          for (const method of inner) found.push({ method, receiver: undefined });
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

function getCleanupCalls(callback: ts.ArrowFunction | ts.FunctionExpression, cleanupNames: ReadonlySet<string>, checker: ts.TypeChecker): ApiCall[] {
  const found: ApiCall[] = [];
  /* Scan all return statements including those inside conditional branches */
  function scanForReturns(node: ts.Node): void {
    if (ts.isReturnStatement(node) && node.expression) {
      found.push(...findCalls(node.expression, cleanupNames, checker, true));
    }
    /* Don't descend into nested functions */
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return;
    ts.forEachChild(node, scanForReturns);
  }
  scanForReturns(callback.body);
  return found;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "useEffect cleanup for addEventListener/setInterval",
  },
  check(ctx) {
    // A project option may still map a method to one name instead of a list
    const option = ctx.options.cleanupMap as Record<string, string | readonly string[]> | undefined;
    const cleanupMap: Record<string, readonly string[]> = option
      ? Object.fromEntries(Object.entries(option).map(([setup, undo]) => [setup, typeof undo === "string" ? [undo] : undo]))
      : CLEANUP_MAP;
    const setupNames = new Set(Object.keys(cleanupMap));
    const cleanupNames = new Set(Object.values(cleanupMap).flat());

    ctx.walk((node) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const effect = resolveCallee(node, ctx.checker);
        if (effect?.packageName !== "react" || (effect.name !== "useEffect" && effect.name !== "useLayoutEffect")) return;
        const callback = node.arguments[0];
        if (!callback) return;
        if (
          !ts.isArrowFunction(callback) &&
          !ts.isFunctionExpression(callback)
        )
          return;

        const setupCalls = findCalls(callback.body, setupNames, ctx.checker, false);
        if (setupCalls.length === 0) return;

        const cleanupCalls = getCleanupCalls(callback, cleanupNames, ctx.checker);
        const reported = new Set<string>();
        for (const setup of setupCalls) {
          const undo = cleanupMap[setup.method] ?? [];
          // With a receiver on both sides it must match (window vs document); a bare clearTimeout(id) undoes window.setTimeout
          const undone = cleanupCalls.some((c) => undo.includes(c.method) &&
            (setup.receiver === undefined || c.receiver === undefined || isSameReference(setup.receiver, c.receiver, ctx.checker)));
          if (!undone && !reported.has(setup.method)) {
            reported.add(setup.method);
            const cleanup = undo.join("/");
            ctx.reportAt(
              callback,
              `Add ${cleanup}() cleanup to useEffect return for ${setup.method}()`,
              {
                action: "add-cleanup",
                pattern: `Return a cleanup function that calls ${cleanup}()`,
                reference: "https://react.dev/reference/react/useEffect",
              }
            );
          }
        }
      }
    });
  },
});
