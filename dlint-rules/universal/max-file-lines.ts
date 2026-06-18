// Enforces file size limit: 300 lines per file.
// Large files indicate missing decomposition or mixed concerns.
// Counts all lines including comments and whitespace.
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MAX_LINES = 300;
// ===========================================================================

export default defineRule({
  meta: {
    category: "quality",
    description: `File exceeds maximum line count (${MAX_LINES} LoC)`,
  },
  check(ctx) {
    const maxLines = (ctx.options.maxLines as number) ?? MAX_LINES;
    const lineCount = ctx.sourceFile.getLineAndCharacterOfPosition(ctx.sourceFile.getEnd()).line + 1;
    if (lineCount <= maxLines) return;
    ctx.reportAt(
      ctx.sourceFile.statements[0] ?? ctx.sourceFile,
      `Split file (${lineCount} lines, max ${maxLines}) by domain concern or extract to shared module`,
      { action: "split-file", pattern: "Extract helpers to shared module, split by domain concern" },
    );
  },
});
