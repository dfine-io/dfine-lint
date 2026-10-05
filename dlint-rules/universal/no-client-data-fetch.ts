// Prevents axios/fetch in Client Components — use Server Actions instead.
// Flags axios calls and fetch('/api/...') in JSX files that are not "use server".
import ts from "typescript";
import { defineRule, hasDirective, isThenable, resolveCallee } from "@dfine-io-gmbh/dlint";

// The /api route segment itself, not a path that merely starts with the letters (/apidocs.json)
function isApiRoute(path: string): boolean {
  return path === "/api" || path.startsWith("/api/") || path.startsWith("/api?");
}

// The leading text of a fetch URL: a string, a backtick string, or a template's head
function urlPrefix(arg: ts.Expression | undefined): string | undefined {
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text;
  return arg && ts.isTemplateExpression(arg) ? arg.head.text : undefined;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No axios/fetch in Client Components — use Server Action",
  },
  check(ctx) {
    // Components live in JSX files: a module without a directive is still client code when a client file imports it
    if (ctx.sourceFile.languageVariant !== ts.LanguageVariant.JSX) return;
    if (hasDirective(ctx.sourceFile, "use server")) return;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = resolveCallee(node, ctx.checker);
      if (!callee) return;

      // axios(...), axios.get(...) or an aliased import: an axios call that returns a promise sends a request
      if (callee.packageName === "axios" && isThenable(ctx.checker.getTypeAtLocation(node), ctx.checker)) {
        ctx.reportAt(node, "Replace axios with Server Action + startTransition in Client Component", {
          action: "use-server-action",
          pattern: "startTransition(async () => { const result = await serverAction(); })",
        });
        return;
      }

      // The global fetch (TS lib or @types/node), globalThis.fetch included, on the project's own /api route
      const prefix = urlPrefix(node.arguments[0]);
      if (callee.global && callee.name === "fetch" && prefix !== undefined && isApiRoute(prefix)) {
        ctx.reportAt(node, "Replace fetch('/api/...') with Server Action in Client Component", {
          action: "use-server-action",
          pattern: "startTransition(async () => { const result = await serverAction(); })",
        });
      }
    });
  },
});
