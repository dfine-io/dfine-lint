// Detects code constructs that add syntax without changing behavior.
// Useless computed keys, string concat of literals, and redundant .call()/.apply().
// These patterns compile but add noise — simplify for clarity.
import ts from "typescript";
import { defineRule, isSameReference } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Useless computed keys, string concat, .call()/.apply(), object shorthand",
    subChecks: 4,
  },
  check(ctx) {
    ctx.walk((node) => {
      // 1. no-useless-computed-key — {["a"]: v} → {a: v}
      if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) {
        const keyVal = node.expression.text;
        // { __proto__: v } sets the prototype and a class's constructor() is its constructor: here the computed key is needed
        if ((keyVal === "__proto__" && ts.isPropertyAssignment(node.parent)) || (keyVal === "constructor" && ts.isClassLike(node.parent.parent))) return;
        const newKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(keyVal)
          ? keyVal
          : node.expression.getText(ctx.sourceFile);
        ctx.reportAt(node, "Unnecessary computed key — use static property name", {
          action: "use-static-key",
          pattern: "Use a static key - { a: v } not { ['a']: v }",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer",
          fix: ctx.createFix(node, newKey),
        });
      }

      // 2. no-useless-concat — "a" + "b" → "ab"
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          ts.isStringLiteral(node.left) && ts.isStringLiteral(node.right)) {
        ctx.reportAt(node, "Unnecessary string concatenation — combine into one string", {
          action: "merge-strings",
          pattern: "Merge into one string literal - 'ab' not 'a' + 'b'",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer",
          fix: ctx.createFix(node, JSON.stringify(node.left.text + node.right.text)),
        });
      }

      // 3. no-useless-call — .call(thisArg) where thisArg is the receiver
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === "call" || node.expression.name.text === "apply")) {
        if (!ts.isPropertyAccessExpression(node.expression.expression)) return;
        if (node.arguments.length === 0) return;
        const thisArg = node.arguments[0];
        if (!thisArg) return;
        const receiver = node.expression.expression.expression;
        if (!ts.isIdentifier(thisArg) || !ts.isIdentifier(receiver)) return;
        if (isSameReference(thisArg, receiver, ctx.checker)) {
          // Auto-fix only .call (spread args map 1:1). .apply passes an array, so dropping it
          // would change argument semantics -- leave .apply as advisory-only.
          const isCall = node.expression.name.text === "call";
          const callee = node.expression.expression;
          ctx.reportAt(node, `Unnecessary .${node.expression.name.text}() — thisArg is the receiver`, {
            action: "direct-call",
            pattern: "Call the method directly - obj.fn(args) not obj.fn.call(obj, args)",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer",
            ...(isCall
              ? {
                  fix: ctx.createFix(
                    node,
                    `${callee.getText(ctx.sourceFile)}(${node.arguments
                      .slice(1)
                      .map((a) => a.getText(ctx.sourceFile))
                      .join(", ")})`,
                  ),
                }
              : {}),
          });
        }
      }

      // 4. object-shorthand — {a: a} → {a}
      // { __proto__ } would define a property where { __proto__: __proto__ } sets the prototype
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ts.isIdentifier(node.initializer) &&
          node.name.text === node.initializer.text && node.name.text !== "__proto__") {
        ctx.reportAt(node, "Use shorthand property", {
          action: "use-shorthand",
          pattern: "Use shorthand - { a } not { a: a }",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer",
          fix: ctx.createFix(node, node.name.text),
        });
      }
    });
  },
});
