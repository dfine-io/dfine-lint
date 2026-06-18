import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Proves `ruleOptions` changes a rule's behavior without copying the rule. The 8-line sample
// would NOT trip max-file-lines at its default (300 LoC); it fires only because ruleOptions sets
// maxLines: 5. max-file-lines is in the opinionated group (off by default), so the group is enabled.
export default {
  rulesDir: "../dlint-rules/universal",
  severity: "error",
  groups: [{ id: "opinionated", severity: "error" }],
  ruleOptions: { "max-file-lines": { maxLines: 5 } },
  include: ["**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "options-island/tsconfig.json",
} satisfies DlintConfig;
