// Flags unescaped entities in JSX text that can cause rendering issues.
// Characters > " ' } must use HTML entities or JSX expressions.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

const ENTITY_MAP: Record<string, string> = {
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "}": "&#125;",
};
const UNESCAPED_PATTERN = /[>"'}]/;

export default defineRule({
  meta: {
    category: "quality",
    description: "No unescaped HTML entities in JSX text",
  },
  check(ctx) {
    if (!ctx.sourceFile.fileName.endsWith(".tsx")) return;
    ctx.walk((node) => {
      if (!ts.isJsxText(node)) return;
      const match = UNESCAPED_PATTERN.exec(node.text);
      if (!match) return;
      const char = match[0] ?? "";
      const entity = ENTITY_MAP[char] ?? char;
      const fixStart = node.getStart(ctx.sourceFile) + (match.index ?? 0);
      ctx.reportAt(node, `Escape "${char}" in JSX text -- use ${entity} or {"${char}"}`, {
        action: "escape-entity",
        pattern: `Replace ${char} with ${entity}`,
        reference: "https://developer.mozilla.org/en-US/docs/Glossary/Entity",
        fix: { start: fixStart, length: char.length, newText: entity },
      });
    });
  },
});
