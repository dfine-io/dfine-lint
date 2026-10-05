// Enforces single-line // comments over /** */ JSDoc multiline blocks.
// Keeps comment style consistent and prevents accidental JSDoc generation.
// Scans the comment trivia at every node's full start (own lines and same-line), each comment once.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No JSDoc multiline comments (/** */)",
  },
  check(ctx) {
    const fullText = ctx.sourceFile.getFullText();
    // A node and its first child share one full start, so the comment, not the node, is the unit
    const reported = new Set<number>();
    ts.forEachChild(ctx.sourceFile, function scan(node) {
      const start = node.getFullStart();
      // Leading ranges start on a new line; a comment after a token on the same line is a trailing range
      const ranges = [...(ts.getLeadingCommentRanges(fullText, start) ?? []), ...(ts.getTrailingCommentRanges(fullText, start) ?? [])];
      for (const range of ranges) {
        if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia || reported.has(range.pos)) continue;
        if (!fullText.startsWith("/**", range.pos)) continue;
        reported.add(range.pos);
        ctx.reportAt(node, "Replace JSDoc multiline comment (/** */) with single-line comment", {
          action: "convert-to-single-line",
          pattern: "Use single-line // comment instead of /** **/",
        });
      }
      ts.forEachChild(node, scan);
    });
  },
});
