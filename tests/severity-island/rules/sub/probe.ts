import { defineRule } from "@dfine-io-gmbh/dlint";

// severity-island probe, in a subfolder so an override can name it "sub/probe": meta.severity warning, an untagged
// finding on the first statement, a "tagged" sub-check on the second, and a third gated by isSubCheckDisabled only
export default defineRule({
  meta: { severity: "warning", category: "quality", description: "Severity probe for the test island" },
  check(ctx) {
    const [first, second, third] = ctx.sourceFile.statements;
    if (first) ctx.reportAt(first, "untagged");
    if (second) ctx.reportAt(second, "tagged", undefined, "tagged");
    if (third && !ctx.isSubCheckDisabled("gated")) ctx.reportAt(third, "gated");
  },
});
