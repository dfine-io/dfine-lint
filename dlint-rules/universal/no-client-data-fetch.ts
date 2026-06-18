// Prevents axios/fetch in Client Components — use Server Actions instead.
// Flags axios calls and fetch('/api/...') in non-server files.
// Ensures data flows through the Server Action boundary for type safety.
import ts from "typescript";
import { defineRule, hasDirective, isLibDeclaration, isNodeModulesDeclaration } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No axios/fetch in Client Components — use Server Action",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;
    if (hasDirective(ctx.sourceFile, "use server")) return;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;

      // axios(...) or axios.get/post/...
      if (ts.isIdentifier(node.expression) && node.expression.text === "axios") {
        const axiosSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (axiosSym && isNodeModulesDeclaration(axiosSym)) {
          ctx.reportAt(node, "Replace axios with Server Action + startTransition in Client Component", {
            action: "use-server-action",
            pattern: "startTransition(async () => { const result = await serverAction(); })",
          });
        }
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "axios"
      ) {
        const axiosSym = ctx.checker.getSymbolAtLocation(node.expression.expression);
        if (axiosSym && isNodeModulesDeclaration(axiosSym)) {
          ctx.reportAt(node, "Replace axios with Server Action + startTransition in Client Component", {
            action: "use-server-action",
            pattern: "startTransition(async () => { const result = await serverAction(); })",
          });
        }
      }

      // fetch('/api/...') — string literal starting with /api
      if (ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
        const fetchSym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!fetchSym || !isLibDeclaration(fetchSym)) return;
        const firstArg = node.arguments[0];
        if (
          firstArg &&
          ts.isStringLiteral(firstArg) &&
          firstArg.text.startsWith("/api")
        ) {
          ctx.reportAt(node, "Replace fetch('/api/...') with Server Action in Client Component", {
            action: "use-server-action",
            pattern: "startTransition(async () => { const result = await serverAction(); })",
          });
        }
        // Template literal: fetch(`/api/${id}`)
        if (
          firstArg &&
          ts.isTemplateExpression(firstArg) &&
          firstArg.head.text.startsWith("/api")
        ) {
          ctx.reportAt(node, "Replace fetch(`/api/...`) with Server Action in Client Component", {
            action: "use-server-action",
            pattern: "startTransition(async () => { const result = await serverAction(); })",
          });
        }
      }
    });
  },
});
