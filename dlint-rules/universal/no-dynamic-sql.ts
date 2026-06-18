// Prevents SQL injection by ensuring db.execute() only receives parameterized input.
// Allows static string literals and Drizzle sql tagged templates.
// Rejects dynamic string concatenation or unparameterized template literals.
// Verifies db is Drizzle client and sql tag is from drizzle-orm via symbol resolution.
import ts from "typescript";
import { defineRule, isDbCall, isNodeModulesDeclaration, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const DRIZZLE_METHODS = ["select", "insert", "update", "delete"] as const;
// ===========================================================================

/** TypeChecker: tagged template tag is `sql` from drizzle-orm (static or dynamic import) */
function isDynamicExternalImport(decl: ts.Declaration): boolean {
  if (!ts.isBindingElement(decl) || !ts.isObjectBindingPattern(decl.parent)) return false;
  const varDecl = decl.parent.parent;
  if (!ts.isVariableDeclaration(varDecl) || !varDecl.initializer) return false;
  const init = ts.isAwaitExpression(varDecl.initializer) ? varDecl.initializer.expression : varDecl.initializer;
  if (!ts.isCallExpression(init) ||
      init.expression.kind !== ts.SyntaxKind.ImportKeyword ||
      init.arguments.length === 0) return false;
  const spec = init.arguments[0];
  return spec !== undefined && ts.isStringLiteral(spec) && !spec.text.startsWith(".");
}

function isDrizzleSqlTag(tag: ts.Identifier, checker: ts.TypeChecker): boolean {
  if (tag.text !== "sql") return false;
  const sym = checker.getSymbolAtLocation(tag);
  if (!sym) return false;
  const resolved = resolveSymbol(checker, sym);
  if (isNodeModulesDeclaration(resolved)) return true;
  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
  return !!decl && isDynamicExternalImport(decl);
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
        isDbCall(node, ctx.checker, drizzleMethods) &&
        node.expression.name.text === "execute" &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (!arg) return;
        // Allow: db.execute("SELECT 1") — static string
        if (ts.isStringLiteral(arg)) return;
        // Allow: db.execute(sql`...`) — tagged template (Drizzle parameterizes)
        if (
          ts.isTaggedTemplateExpression(arg) &&
          ts.isIdentifier(arg.tag) &&
          isDrizzleSqlTag(arg.tag, ctx.checker)
        )
          return;
        // Allow: db.execute(query) where query is initialized as sql`...`
        if (ts.isIdentifier(arg)) {
          const sym = ctx.checker.getSymbolAtLocation(arg);
          const decl = sym?.valueDeclaration;
          if (
            decl &&
            ts.isVariableDeclaration(decl) &&
            decl.initializer &&
            ts.isTaggedTemplateExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.tag) &&
            isDrizzleSqlTag(decl.initializer.tag, ctx.checker)
          )
            return;
        }
        // Allow: db.execute(ternary ? sql`a` : sql`b`)
        if (
          ts.isConditionalExpression(arg) &&
          ts.isTaggedTemplateExpression(arg.whenTrue) &&
          ts.isIdentifier(arg.whenTrue.tag) &&
          isDrizzleSqlTag(arg.whenTrue.tag, ctx.checker) &&
          ts.isTaggedTemplateExpression(arg.whenFalse) &&
          ts.isIdentifier(arg.whenFalse.tag) &&
          isDrizzleSqlTag(arg.whenFalse.tag, ctx.checker)
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
