// A test-only consumer rule: it reports wherever an SDK helper answers yes at a marker call, so the
// harness pins the helper's public contract. branch(): isInConditionalBranch. lib(X): isLibDeclaration
// on X's symbol. pkg(X, "name"): isFromPackage(X, "name"). value(expr): valueSymbolOf at each shorthand
// default value in expr names that value, not the property it defaults. callee(call, spec): resolveCallee's
// origin:name[:module][:global] equals spec. typePkg(X, "name"): isTypeFromPackage on X's type.
// error(X): extendsLibType(X's type, ["Error"]). db(call): isDbCall without a package name.
import ts from "typescript";
import {
  defineRule,
  extendsLibType,
  isDbCall,
  isFromPackage,
  isInConditionalBranch,
  isLibDeclaration,
  isTypeFromPackage,
  resolveCallee,
  valueSymbolOf,
} from "@dfine-io-gmbh/dlint";

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
      if (marker === "callee" && arg && ts.isCallExpression(arg) && name && ts.isStringLiteral(name)) {
        const c = resolveCallee(arg, ctx.checker);
        const origin = c?.lib ? "lib" : (c?.packageName ?? "project");
        const spec = c && [origin, c.name, ...(c.moduleName ? [c.moduleName] : []), ...(c.global ? ["global"] : [])].join(":");
        if (spec === name.text) ctx.reportAt(node, `callee ${spec}`);
      }
      if (marker === "typePkg" && arg && name && ts.isStringLiteral(name)) {
        if (isTypeFromPackage(ctx.checker.getTypeAtLocation(arg), ctx.checker, name.text)) ctx.reportAt(node, `type from ${name.text}`);
      }
      if (marker === "error" && arg && extendsLibType(ctx.checker.getTypeAtLocation(arg), ctx.checker, ["Error"])) {
        ctx.reportAt(node, "lib Error or a subclass");
      }
      if (marker === "db" && arg && isDbCall(arg, ctx.checker, ["select", "insert", "update", "delete"])) {
        ctx.reportAt(node, "db call");
      }
    });
  },
});
