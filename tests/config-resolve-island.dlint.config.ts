import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Proves `dlint --config <file>` runs from any cwd on any target: rulesDir + tsconfig resolve
// relative to THIS file's directory (tests/), not the cwd. The tsconfig sits one level deeper
// (config-resolve-island/), so its `include: ["src/**"]` only resolves with the
// dirname(tsconfig) basePath fix — without it the program is empty and the rule finds 0.
// Run from anywhere: node build/cli.js --config tests/config-resolve-island.dlint.config.ts \
//   --rules unbranded-type-consistency --files config-resolve-island/src/sample.ts
export default {
  rulesDir: "../dlint-rules/universal",
  severity: "error",
  // unbranded-type-consistency is in the opinionated group — enable it for this test.
  groups: [{ id: "opinionated", severity: "error" }],
  include: ["**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "config-resolve-island/tsconfig.json",
} satisfies DlintConfig;
