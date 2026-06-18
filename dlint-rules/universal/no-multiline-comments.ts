// Enforces single-line // comments over /** */ JSDoc multiline blocks.
// Keeps comment style consistent and prevents accidental JSDoc generation.
// Scans leading comment trivia on all nodes via TypeChecker API.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "No JSDoc multiline comments (/** */)",
  },
  check(ctx) {
    const fullText = ctx.sourceFile.getFullText();
    // TypeScript exposes comments via getLeadingCommentRanges/getTrailingCommentRanges
    // but scanning all comment ranges from source text is more complete
    ts.forEachChild(ctx.sourceFile, function scan(node) {
      const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
      if (ranges) {
        for (const range of ranges) {
          if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
            const text = fullText.slice(range.pos, range.end);
            if (text.startsWith("/**")) {
              ctx.reportAt(node, "Replace JSDoc multiline comment (/** */) with single-line comment", {
                action: "convert-to-single-line",
                pattern: "Use single-line // comment instead of /** **/",
              });
            }
          }
        }
      }
      ts.forEachChild(node, scan);
    });
  },
});
