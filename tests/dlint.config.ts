import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// SDK self-test harness. Loads the bundled universal rules and runs them against
// self-contained fixtures. Invoke: `node build/cli.js --path tests --rules <id> --files fixtures/<id>.fixture.ts`.
export default {
  rulesDir: "../dlint-rules/universal",
  severity: "error",
  // The harness tests every rule in isolation, so the opinionated group is enabled here.
  groups: [{ id: "opinionated", severity: "error" }],
  include: ["fixtures/**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "./tsconfig.json",
} satisfies DlintConfig;
