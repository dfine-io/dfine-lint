// Blocks SQL injection: db.execute() on a drizzle-orm handle takes a static string or a sql template.
// The sql tag is identified by its type, however it was imported. A template is dynamic when a sql.raw() call with
// no static text sits anywhere in its spans (nested templates, sql.join, a ternary) or in the initializer of a
// variable a span names, one level. sql.raw(x) is static only when x is a string literal, or names a const whose
// initializer is one (`as` allowed); a parameter, a property, a call or a cast can carry input whatever its type.
// db.execute(q) passes only when q is a const of the same file holding a clean template that no q.append() in that
// file extends with dynamic raw text; an imported query can be extended where it lives, so it is reported.
import ts from "typescript";
import { defineRule, isDbCall, isTypeFromPackage, resolveCallee, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

// A cast cannot change a literal's text, so `"users" as const` stays a literal
function isLiteralText(node: ts.Expression): boolean {
  return ts.isStringLiteralLike(ts.isAsExpression(node) ? node.expression : node);
}

// The variable an identifier names, through imports
function variableOf(node: ts.Node, checker: ts.TypeChecker): ts.VariableDeclaration | undefined {
  const sym = ts.isIdentifier(node) ? checker.getSymbolAtLocation(node) : undefined;
  const decl = sym && resolveSymbol(checker, sym).valueDeclaration;
  return decl && ts.isVariableDeclaration(decl) ? decl : undefined;
}

function isConst(decl: ts.VariableDeclaration): boolean {
  return (ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) !== 0;
}

function isStaticText(node: ts.Expression, checker: ts.TypeChecker): boolean {
  if (isLiteralText(node)) return true;
  const decl = variableOf(node, checker);
  return !!decl?.initializer && isConst(decl) && isLiteralText(decl.initializer);
}

// sql.raw(x) splices x unescaped: one with no static text under node, a named variable's initializer followed once
function hasDynamicRaw(node: ts.Node, checker: ts.TypeChecker, follow = true): boolean {
  if (ts.isCallExpression(node)) {
    const callee = resolveCallee(node, checker);
    const [arg] = node.arguments;
    if (callee?.packageName === "drizzle-orm" && callee.name === "raw" && !(arg && isStaticText(arg, checker))) return true;
  }
  const initializer = follow ? variableOf(node, checker)?.initializer : undefined;
  if (initializer && hasDynamicRaw(initializer, checker, false)) return true;
  return ts.forEachChild(node, (child) => hasDynamicRaw(child, checker, follow) || undefined) ?? false;
}

function hasDynamicRawSpan(template: ts.TemplateLiteral, checker: ts.TypeChecker): boolean {
  if (!ts.isTemplateExpression(template)) return false;
  return template.templateSpans.some((span) => hasDynamicRaw(span.expression, checker));
}

// The variables a file's q.append(...) calls extend with dynamic raw text, walked once per file
const rawAppended = new WeakMap<ts.SourceFile, ReadonlySet<ts.VariableDeclaration>>();
function rawAppendedIn(sourceFile: ts.SourceFile, checker: ts.TypeChecker): ReadonlySet<ts.VariableDeclaration> {
  const cached = rawAppended.get(sourceFile);
  if (cached) return cached;
  const appended = new Set<ts.VariableDeclaration>();
  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "append" &&
        n.arguments.some((a) => hasDynamicRaw(a, checker))) {
      const target = variableOf(n.expression.expression, checker);
      if (target) appended.add(target);
    }
    ts.forEachChild(n, visit);
  }
  visit(sourceFile);
  rawAppended.set(sourceFile, appended);
  return appended;
}

// db.execute(q): q is a const of this file holding a clean template, and no q.append(...) here adds dynamic raw text
function isCleanQuery(arg: ts.Expression, checker: ts.TypeChecker, sourceFile: ts.SourceFile): boolean {
  const decl = variableOf(arg, checker);
  if (!decl?.initializer || decl.getSourceFile() !== sourceFile || !isConst(decl)) return false;
  return isDrizzleSqlTemplate(decl.initializer, checker) && !rawAppendedIn(sourceFile, checker).has(decl);
}

// A sql`...` template whose tag is drizzle-orm's sql (static, aliased, member or await import()) and has no raw span
function isDrizzleSqlTemplate(node: ts.Expression, checker: ts.TypeChecker): boolean {
  if (!ts.isTaggedTemplateExpression(node)) return false;
  const type = checker.getTypeAtLocation(node.tag);
  if (type.getSymbol()?.name !== "sql" || !isTypeFromPackage(type, checker, "drizzle-orm")) return false;
  return !hasDynamicRawSpan(node.template, checker);
}

export default defineRule({
  meta: {
    category: "security",
    description: "No db.execute() with dynamic SQL input",
  },
  check(ctx) {
    const drizzleMethods = (ctx.options.drizzleMethods as readonly string[]) ?? DRIZZLE_METHODS;
    ctx.walk((node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "execute" &&
        isDbCall(node, ctx.checker, drizzleMethods, "drizzle-orm") &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (!arg) return;
        // Allow: db.execute("SELECT 1") — static string
        if (ts.isStringLiteral(arg)) return;
        // Allow: db.execute(sql`...`) — tagged template (Drizzle parameterizes)
        if (isDrizzleSqlTemplate(arg, ctx.checker)) return;
        // Allow: db.execute(query) where query is a const sql`...` nothing appends a dynamic span to
        if (isCleanQuery(arg, ctx.checker, ctx.sourceFile)) return;
        // Allow: db.execute(ternary ? sql`a` : sql`b`)
        if (
          ts.isConditionalExpression(arg) &&
          isDrizzleSqlTemplate(arg.whenTrue, ctx.checker) &&
          isDrizzleSqlTemplate(arg.whenFalse, ctx.checker)
        )
          return;
        ctx.reportAt(
          node,
          "Replace dynamic db.execute() input with Drizzle query builder -- SQL injection risk",
          {
            action: "use-drizzle-api",
            pattern:
              "Use Drizzle query builder (db.select/insert/update/delete) instead",
            reference: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
          }
        );
      }
    });
  },
});
