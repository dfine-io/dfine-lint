import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Loads only the over-long-description fixture rule, so `--list-rules` produces one entry that
// breaks the 120-character contract. The harness asserts the length check reports it; without
// this island the check would only ever see valid descriptions and could rot unnoticed.
// No tsconfig and no source files are needed: --list-rules never builds a Program.
export default {
  bundledRules: false,
  rulesDir: "list-rules-island/bad-length",
  severity: "error",
} satisfies DlintConfig;
