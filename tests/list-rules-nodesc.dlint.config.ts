import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Loads only the fixture rule whose meta carries no description. The harness asserts the run
// fails with a non-zero exit instead of emitting an entry that lacks the second contract field.
// No tsconfig and no source files are needed: --list-rules never builds a Program.
export default {
  bundledRules: false,
  rulesDir: "list-rules-island/no-desc",
  severity: "error",
} satisfies DlintConfig;
