import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Intentionally points at a malformed tsconfig.json so program creation throws at runtime.
// The cli-robustness harness check asserts the CLI reports a friendly `dlint:` error with a
// non-zero exit and NO Node stack trace (the top-level guard in cli.ts).
export default {
  rulesDir: "../../dlint-rules/universal",
  severity: "error",
  include: ["src/**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "./tsconfig.json",
} satisfies DlintConfig;
