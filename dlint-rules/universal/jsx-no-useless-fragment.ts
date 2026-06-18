// Flags useless JSX fragments (<>child</>) that wrap a single element.
// A fragment with one child can be replaced by the child directly.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No useless JSX fragments wrapping a single child",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;
    ctx.walk((node) => {
      if (!ts.isJsxFragment(node)) return;
      const children = node.children.filter(
        (c) => !(ts.isJsxText(c) && c.text.trim() === ""),
      );
      if (children.length !== 1) return;
      const child = children[0];
      if (!child) return;
      // Allow: <>{expression}</> — fragment around expression may be needed for type
      if (ts.isJsxExpression(child)) return;
      // Auto-fix only when the single child is itself an element/fragment; unwrapping a bare
      // JsxText child (<>hello</> -> hello) would turn rendered text into an identifier.
      const isElementChild =
        ts.isJsxElement(child) ||
        ts.isJsxSelfClosingElement(child) ||
        ts.isJsxFragment(child);
      ctx.reportAt(node, "Useless fragment — unwrap the single child", {
        action: "remove-fragment",
        pattern: "Replace <>child</> with the child directly",
        reference: "https://react.dev/reference/react/Fragment",
        ...(isElementChild
          ? { fix: ctx.createFix(node, child.getText(ctx.sourceFile)) }
          : {}),
      });
    });
  },
});
