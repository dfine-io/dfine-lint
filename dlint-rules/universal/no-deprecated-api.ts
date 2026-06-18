// Flags deprecated/obsolete JS APIs: __proto__, arguments.caller/callee,
// and native prototype extension. All sub-checks use TypeChecker verification.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Deprecated API: __proto__, arguments.caller, extend-native",
    subChecks: 3,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-proto — __proto__ access (TypeChecker-verified)
      if (ts.isPropertyAccessExpression(node) && node.name.text === "__proto__") {
        const protoSym = ctx.checker.getSymbolAtLocation(node.name);
        if (!protoSym || isLibDeclaration(protoSym)) {
          // Auto-fix only a READ: `obj.__proto__` -> `Object.getPrototypeOf(obj)`. A write target
          // (`obj.__proto__ = x`) must NOT become `Object.getPrototypeOf(obj) = x` (invalid).
          const isWriteTarget =
            ts.isBinaryExpression(node.parent) &&
            node.parent.left === node &&
            node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
          ctx.reportAt(node, "Use Object.getPrototypeOf() instead of __proto__", {
            action: "use-getPrototypeOf",
            pattern: "Replace __proto__ read with Object.getPrototypeOf(obj)",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf",
            ...(isWriteTarget
              ? {}
              : { fix: ctx.createFix(node, `Object.getPrototypeOf(${node.expression.getText(ctx.sourceFile)})`) }),
          });
        }
      }

      // no-caller — arguments.caller / arguments.callee (TypeChecker-verified)
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "arguments" &&
          (node.name.text === "caller" || node.name.text === "callee")) {
        const argsSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (argsSym && (argsSym.flags & ts.SymbolFlags.FunctionScopedVariable)) {
          ctx.reportAt(node, `arguments.${node.name.text} is deprecated — use named functions`, {
            action: "use-named-function", pattern: "Use named function reference instead",
          });
        }
      }

      // no-extend-native — prototype assignment on global constructors
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) && node.left.name.text === "prototype" &&
          ts.isPropertyAccessExpression(node.left.expression)) {
        const objSym = ctx.checker.getSymbolAtLocation(node.left.expression.expression);
        if (objSym && isLibDeclaration(objSym)) {
          ctx.reportAt(node, "Do not extend native prototypes", {
            action: "no-extend", pattern: "Create utility function instead of modifying built-in prototype",
          });
        }
      }
    });
  },
});
