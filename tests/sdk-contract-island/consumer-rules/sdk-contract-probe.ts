// A test-only consumer rule: it reports wherever an SDK helper answers yes at a marker call, so the
// harness pins the helper's public contract. branch(): isInConditionalBranch. lib(X): isLibDeclaration
// on X's symbol. pkg(X, "name"): isFromPackage(X, "name"). value(expr): valueSymbolOf at each shorthand
// default value in expr names that value, not the property it defaults.
import ts from "typescript";
import { defineRule, isFromPackage, isInConditionalBranch, isLibDeclaration, valueSymbolOf } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Test probe that reports SDK helper verdicts at marker calls",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      const marker = node.expression.text;
      const [arg, name] = node.arguments;
      if (marker === "branch" && isInConditionalBranch(node)) ctx.reportAt(node, "in a conditional branch");
      if (marker === "lib" && arg && ts.isIdentifier(arg)) {
        const sym = ctx.checker.getSymbolAtLocation(arg);
        if (sym && isLibDeclaration(sym)) ctx.reportAt(node, "TypeScript lib declaration");
      }
      if (marker === "pkg" && arg && ts.isIdentifier(arg) && name && ts.isStringLiteral(name)) {
        if (isFromPackage(arg, ctx.checker, name.text)) ctx.reportAt(node, `from package ${name.text}`);
      }
      if (marker === "value" && arg) {
        const visit = (n: ts.Node): void => {
          const init = ts.isShorthandPropertyAssignment(n) ? n.objectAssignmentInitializer : undefined;
          if (init && ts.isIdentifier(init) && valueSymbolOf(init, ctx.checker)?.name === init.text) ctx.reportAt(node, `value ${init.text}`);
          ts.forEachChild(n, visit);
        };
        visit(arg);
      }
    });
  },
});
