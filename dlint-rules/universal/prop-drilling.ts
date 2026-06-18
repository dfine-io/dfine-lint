// Flags React components forwarding >=4 prop units (>=2 of them callbacks) to custom children
// without consuming them. A unit = a prop, a member path (handlers.a), or one {...spread}; identity
// and callback-ness come from the type checker, so bundling/shadowing/data-rendering don't false-fire.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MIN_FORWARDED = 4;
const MIN_CALLBACKS = 2;
const MAX_SHALLOW_PROPS = 10;
// ===========================================================================

function isIntrinsicTag(name: string): boolean {
  const code = name.charCodeAt(0);
  return (code >= 97 && code <= 122) || name.includes("-");
}

function isCustomElement(node: ts.Node): boolean {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
  const tag = node.tagName;
  return ts.isIdentifier(tag) ? !isIntrinsicTag(tag.text) : true;
}

function hasHookCalls(body: ts.Block): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text.startsWith("use")) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

function resolveAccessPath(id: ts.Identifier): { path: string; rootNode: ts.Node } {
  let cur: ts.Node = id;
  let path = "";
  for (;;) {
    const parent = cur.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === cur) {
      path += "." + parent.name.text;
      cur = parent;
    } else if (ts.isElementAccessExpression(parent) && parent.expression === cur) {
      const arg = parent.argumentExpression;
      path += arg && (ts.isStringLiteral(arg) || ts.isNumericLiteral(arg)) ? "." + arg.text : "[]";
      cur = parent;
    } else {
      break;
    }
  }
  return { path, rootNode: cur };
}

function isExactBody(fn: ts.ArrowFunction | ts.FunctionExpression, expr: ts.Node): boolean {
  if (fn.body === expr) return true;
  if (ts.isBlock(fn.body) && fn.body.statements.length === 1) {
    const stmt = fn.body.statements[0];
    if (!stmt) return false;
    if (ts.isReturnStatement(stmt) && stmt.expression === expr) return true;
    if (ts.isExpressionStatement(stmt) && stmt.expression === expr) return true;
  }
  return false;
}

function classifyOccurrence(rootNode: ts.Node): "forward" | "consume" {
  let cur: ts.Node = rootNode;
  for (;;) {
    const parent = cur.parent;
    if (ts.isParenthesizedExpression(parent)) {
      cur = parent;
    } else if (ts.isCallExpression(parent) && parent.expression === cur) {
      cur = parent;
    } else if ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && isExactBody(parent, cur)) {
      cur = parent;
    } else {
      break;
    }
  }
  if (ts.isJsxExpression(cur.parent) && ts.isJsxAttribute(cur.parent.parent)) {
    return isCustomElement(cur.parent.parent.parent.parent) ? "forward" : "consume";
  }
  return "consume";
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Component forwards props without consuming — use stores or hooks",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;
    const checker = ctx.checker;
    const minForwarded = (ctx.options.minForwarded as number) ?? MIN_FORWARDED;
    const minCallbacks = (ctx.options.minCallbacks as number) ?? MIN_CALLBACKS;
    const maxShallowProps = (ctx.options.maxShallowProps as number) ?? MAX_SHALLOW_PROPS;

    ctx.walk((node) => {
      if (!ts.isFunctionDeclaration(node) && !ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return;
      if (!node.body || !ts.isBlock(node.body)) return;

      const hasJsxReturn = node.body.statements.some(
        (s) =>
          ts.isReturnStatement(s) &&
          s.expression &&
          (ts.isJsxElement(s.expression) ||
            ts.isJsxSelfClosingElement(s.expression) ||
            ts.isJsxFragment(s.expression) ||
            ts.isParenthesizedExpression(s.expression) ||
            ts.isConditionalExpression(s.expression))
      );
      if (!hasJsxReturn) return;

      const firstParam = node.parameters[0];
      if (!firstParam) return;

      const rootSymbols = new Set<ts.Symbol>();
      const rootNames = new Set<string>();
      const paramName = firstParam.name;
      if (ts.isObjectBindingPattern(paramName)) {
        for (const el of paramName.elements) {
          if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
            const sym = checker.getSymbolAtLocation(el.name);
            if (sym) {
              rootSymbols.add(sym);
              rootNames.add(el.name.text);
            }
          }
        }
      } else if (ts.isIdentifier(paramName)) {
        const sym = checker.getSymbolAtLocation(paramName);
        if (sym) {
          rootSymbols.add(sym);
          rootNames.add(paramName.text);
        }
      } else {
        return;
      }
      if (rootSymbols.size === 0) return;

      const forwardedKeys = new Map<string, ts.Node>();
      const consumedKeys = new Set<string>();

      function classify(n: ts.Node): void {
        if (ts.isIdentifier(n) && rootNames.has(n.text)) {
          if (ts.isBindingElement(n.parent)) return;
          if (ts.isJsxAttribute(n.parent) && n.parent.name === n) return;
          let sym = checker.getSymbolAtLocation(n);
          if (ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) {
            sym = checker.getShorthandAssignmentValueSymbol(n.parent) ?? sym;
          }
          if (sym && rootSymbols.has(sym)) {
            const { path, rootNode } = resolveAccessPath(n);
            const display = n.text + path;
            const spread = rootNode.parent;
            if (ts.isJsxSpreadAttribute(spread) && spread.expression === rootNode) {
              if (isCustomElement(spread.parent.parent)) forwardedKeys.set(display, rootNode);
              return;
            }
            if (classifyOccurrence(rootNode) === "forward") forwardedKeys.set(display, rootNode);
            else consumedKeys.add(display);
            return;
          }
        }
        ts.forEachChild(n, classify);
      }
      classify(node.body);

      // A forward is cancelled when the path itself OR a descendant (prop.field) is consumed —
      // genuine local use. An ancestor consume (bare bundle) does NOT cancel, blocking the escape.
      const isConsumed = (key: string): boolean => {
        if (consumedKeys.has(key)) return true;
        for (const c of consumedKeys) if (c.startsWith(key + ".") || c.startsWith(key + "[")) return true;
        return false;
      };
      const forwardedUnits = [...forwardedKeys.keys()].filter((k) => !isConsumed(k)).sort();
      if (forwardedUnits.length < minForwarded) return;

      // Only behaviour threading (callbacks/setters) is fixable via stores/hooks in leaves; pure
      // data rendered into display children is not drilling. Require >=2 forwarded function units.
      const callbackCount = forwardedUnits.filter((k) => {
        const node = forwardedKeys.get(k);
        return !!node && checker.getNonNullableType(checker.getTypeAtLocation(node)).getCallSignatures().length > 0;
      }).length;
      if (callbackCount < minCallbacks) return;

      const generatesData = hasHookCalls(node.body);
      if (generatesData && forwardedUnits.length <= maxShallowProps) return;

      let componentName = "Component";
      if (ts.isFunctionDeclaration(node) && node.name) {
        componentName = node.name.text;
      } else if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        componentName = node.parent.name.text;
      }

      const message = `Reduce prop drilling in ${componentName} -- ${forwardedUnits.length} prop units forwarded without consumption: ${forwardedUnits.join(", ")}`;
      ctx.reportAt(firstParam, message, {
        action: "eliminate-drilling",
        pattern: generatesData
          ? "Bundle related props into objects or use composition - extreme prop count"
          : "Use stores or hooks directly in leaf components - pure forwarder without hooks",
        reference: "https://react.dev/learn/passing-data-deeply-with-context",
      });
    });
  },
});
