import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Intentionally points at a malformed tsconfig.json so program creation throws at runtime.
// The cli-robustness harness check asserts the CLI reports a friendly `dlint:` error with a
// non-zero exit and NO Node stack trace (the top-level guard in cli.ts). The config-guard checks
// pick one of the other tsconfigs in this dir through DLINT_GUARD_TSCONFIG.
export default {
  rulesDir: "../../dlint-rules/universal",
  severity: "error",
  include: ["src/**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: process.env.DLINT_GUARD_TSCONFIG ?? "./tsconfig.json",
} satisfies DlintConfig;
