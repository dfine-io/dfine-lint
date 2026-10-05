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
          ctx.reportAt(node, "Use Object.getPrototypeOf() instead of __proto__", {
            action: "use-getPrototypeOf",
            pattern: "Object.getPrototypeOf(obj) to read, Object.setPrototypeOf(obj, proto) to write",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf",
          });
        }
      }

      // no-caller — arguments.caller / arguments.callee (TypeChecker-verified)
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "arguments" &&
          (node.name.text === "caller" || node.name.text === "callee")) {
        const argsSym = ctx.checker.getSymbolAtLocation(node.expression);
        // The built-in arguments object has no declaration; a binding named arguments would have one
        if (argsSym && !argsSym.declarations?.length) {
          ctx.reportAt(node, `arguments.${node.name.text} is deprecated — use named functions`, {
            action: "use-named-function", pattern: "Use named function reference instead",
          });
        }
      }

      // no-extend-native — X.prototype = … or X.prototype.m = … on a lib constructor (Array, not foo.constructor)
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        let target: ts.Expression = node.left;
        let member: ts.PropertyAccessExpression | undefined;
        while (ts.isPropertyAccessExpression(target) && target.name.text !== "prototype") {
          member = target;
          target = target.expression;
        }
        const objSym = ts.isPropertyAccessExpression(target) ? ctx.checker.getSymbolAtLocation(target.expression) : undefined;
        const isConstructor = !!objSym && ctx.checker.getTypeOfSymbol(objSym).getConstructSignatures().length > 0;
        // A member the lib declares is filled in or stubbed (a polyfill, a test double), not added
        const memberSym = member && ctx.checker.getSymbolAtLocation(member.name);
        const standardMember = !!memberSym && isLibDeclaration(memberSym);
        if (objSym && isConstructor && isLibDeclaration(objSym) && !standardMember) {
          ctx.reportAt(node, "Do not extend native prototypes", {
            action: "no-extend", pattern: "Create utility function instead of modifying built-in prototype",
          });
        }
      }
    });
  },
});
