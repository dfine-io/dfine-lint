// Suggests modern API replacements: .includes() over .indexOf(),
// .flatMap() over .map().flat(), .at() over [length-1], .startsWith(),
// Object.hasOwn(), spread over Object.assign, destructuring over delete.
import ts from "typescript";
import { defineRule, isLibDeclaration, isNodeModulesDeclaration, isSameReference, isWriteTarget } from "@dfine-io-gmbh/dlint";

const isNegativeOne = (n: ts.Expression): boolean =>
  ts.isPrefixUnaryExpression(n) &&
  n.operator === ts.SyntaxKind.MinusToken &&
  ts.isNumericLiteral(n.operand) && n.operand.text === "1";

const isZeroLiteral = (n: ts.Expression): boolean =>
  ts.isNumericLiteral(n) && n.text === "0";

// The lib-declared member a receiver's type offers, so a suggestion only names an API that exists there
function libMember(checker: ts.TypeChecker, receiver: ts.Expression, name: string): ts.Symbol | undefined {
  const member = checker.getApparentType(checker.getTypeAtLocation(receiver)).getProperty(name);
  return member && isLibDeclaration(member) ? member : undefined;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Modern API: includes, flatMap, at, startsWith, hasOwn, no-delete, no-assign",
    subChecks: 7,
  },
  check(ctx) {
    ctx.walk((node) => {
      // prefer-includes: .indexOf(x) !== -1 → .includes(x)
      if (
        ts.isBinaryExpression(node) &&
        ts.isCallExpression(node.left) && ts.isPropertyAccessExpression(node.left.expression) &&
        node.left.expression.name.text === "indexOf"
      ) {
        const indexOfSym = ctx.checker.getSymbolAtLocation(node.left.expression.name);
        if (!indexOfSym || (!isLibDeclaration(indexOfSym) && !isNodeModulesDeclaration(indexOfSym))) return;
        const op = node.operatorToken.kind;
        if (
          ((op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken ||
            op === ts.SyntaxKind.GreaterThanToken) && isNegativeOne(node.right)) ||
          (op === ts.SyntaxKind.GreaterThanEqualsToken && isZeroLiteral(node.right))
        ) {
          ctx.reportAt(node, "Use .includes() instead of .indexOf() !== -1", {
            action: "prefer-includes",
            pattern: "arr.includes(x) instead of arr.indexOf(x) !== -1",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
          });
        }
      }

      // no-delete-property: delete obj.prop
      if (ts.isDeleteExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        ctx.reportAt(node, "delete obj.prop - use destructuring to omit", { action: "use-destructuring", pattern: "const { removed, ...rest } = obj", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array" });
      }

      // no-object-assign: Object.assign mutates first arg
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "Object" &&
        node.expression.name.text === "assign"
      ) {
        const objSym = ctx.checker.getSymbolAtLocation(node.expression.expression);
        if (objSym && isLibDeclaration(objSym)) {
          ctx.reportAt(node, "Object.assign mutates first argument - use spread { ...a, ...b }", { action: "use-spread", pattern: "{ ...target, ...source } instead of Object.assign", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array" });
        }
      }

      // use-flat-map: .map().flat() → .flatMap() (only depth=1)
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "flat" && ts.isCallExpression(node.expression.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression.expression) &&
        node.expression.expression.expression.name.text === "map" &&
        (node.arguments.length === 0 || (node.arguments.length === 1 && !!node.arguments[0] && ts.isNumericLiteral(node.arguments[0]) && node.arguments[0].text === "1"))
      ) {
        const flatSym = ctx.checker.getSymbolAtLocation(node.expression.name);
        const mapSym = ctx.checker.getSymbolAtLocation(node.expression.expression.expression.name);
        const isVerified = (s: ts.Symbol | undefined): boolean => !!s && (isLibDeclaration(s) || isNodeModulesDeclaration(s));
        if (!isVerified(flatSym) || !isVerified(mapSym)) return;
        const mapCall = (node.expression as ts.PropertyAccessExpression).expression as ts.CallExpression;
        const mapProp = mapCall.expression as ts.PropertyAccessExpression;
        const fmReceiver = mapProp.expression.getText(ctx.sourceFile);
        // flatMap takes the same callback and thisArg as map
        const fmArgs = mapCall.arguments.map((a) => a.getText(ctx.sourceFile)).join(", ");
        ctx.reportAt(node, ".map().flat() - use .flatMap()", {
          action: "use-flatmap",
          pattern: ".flatMap(fn) instead of .map(fn).flat()",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
          fix: ctx.createFix(node, fmReceiver + ".flatMap(" + fmArgs + ")"),
        });
      }

      // use-at: arr[arr.length - 1] → arr.at(-1)
      if (
        ts.isElementAccessExpression(node) && ts.isBinaryExpression(node.argumentExpression) &&
        node.argumentExpression.operatorToken.kind === ts.SyntaxKind.MinusToken &&
        ts.isPropertyAccessExpression(node.argumentExpression.left) &&
        node.argumentExpression.left.name.text === "length" &&
        isSameReference(node.expression, node.argumentExpression.left.expression, ctx.checker) &&
        !isWriteTarget(node) && !!libMember(ctx.checker, node.expression, "at")
      ) {
        const lengthSym = ctx.checker.getSymbolAtLocation(node.argumentExpression.left.name);
        if (!lengthSym || (!isLibDeclaration(lengthSym) && !isNodeModulesDeclaration(lengthSym))) return;
        const atReceiver = node.expression.getText(ctx.sourceFile);
        const atOffset = node.argumentExpression.right;
        // .at(-n) reads arr[arr.length - n] only for a whole n >= 1, and a callee would lose its this
        const exact = ts.isNumericLiteral(atOffset) && Number.isInteger(Number(atOffset.text)) && Number(atOffset.text) >= 1;
        const isCallee = ts.isCallExpression(node.parent) && node.parent.expression === node;
        ctx.reportAt(node, "arr[arr.length - N] - use arr.at(-N)", {
          action: "use-array-at",
          pattern: "arr.at(-1) instead of arr[arr.length - 1]",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
          fix: exact && !isCallee ? ctx.createFix(node, atReceiver + ".at(-" + atOffset.text + ")") : undefined,
        });
      }

      // prefer-starts-ends: .indexOf(x) === 0 → .startsWith(x)
      if (
        ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isCallExpression(node.left) && ts.isPropertyAccessExpression(node.left.expression) &&
        node.left.expression.name.text === "indexOf" &&
        ts.isNumericLiteral(node.right) && node.right.text === "0" &&
        node.left.arguments.length === 1 && !!libMember(ctx.checker, node.left.expression.expression, "startsWith")
      ) {
        const ioSym = ctx.checker.getSymbolAtLocation(node.left.expression.name);
        if (!ioSym || (!isLibDeclaration(ioSym) && !isNodeModulesDeclaration(ioSym))) return;
        const swReceiver = node.left.expression.expression.getText(ctx.sourceFile);
        const swArg = node.left.arguments[0]?.getText(ctx.sourceFile) ?? "";
        ctx.reportAt(node, ".indexOf(x) === 0 - use .startsWith(x)", {
          action: "use-starts-with",
          pattern: ".startsWith(x) instead of .indexOf(x) === 0",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith",
          fix: ctx.createFix(node, swReceiver + ".startsWith(" + swArg + ")"),
        });
      }

      // prefer-object-has-own
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "call" &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "hasOwnProperty"
      ) {
        const hopSym = ctx.checker.getSymbolAtLocation(node.expression.expression.name);
        if (!hopSym || !isLibDeclaration(hopSym)) return;
        // Object.hasOwn exists from ES2022 on: suggest it only where the program's lib declares it
        const objectSym = ctx.checker.resolveName("Object", node, ts.SymbolFlags.Value, false);
        const hasOwn = objectSym && ctx.checker.getTypeOfSymbol(objectSym).getProperty("hasOwn");
        if (!hasOwn || !isLibDeclaration(hasOwn)) return;
        const hoObj = node.arguments[0]?.getText(ctx.sourceFile) ?? "";
        const hoKey = node.arguments[1]?.getText(ctx.sourceFile) ?? "";
        ctx.reportAt(node, "Use Object.hasOwn() instead of hasOwnProperty.call()", {
          action: "use-object-has-own",
          pattern: "Object.hasOwn(obj, key)",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
          fix: node.arguments.length >= 2 ? ctx.createFix(node, "Object.hasOwn(" + hoObj + ", " + hoKey + ")") : undefined,
        });
      }
    });
  },
});
