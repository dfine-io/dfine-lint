import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Proves no-duplicate-schema-export's `ignorePaths` option: Shared is duplicated in
// src/ignored/mirror.ts, but ignorePaths excludes "ignored/" so it is NOT flagged; Twin (duplicated
// in src/keep2.ts, not ignored) still fires. no-duplicate-schema-export is default-on (no group needed).
export default {
  rulesDir: "../dlint-rules/universal",
  severity: "error",
  ruleOptions: { "no-duplicate-schema-export": { ignorePaths: ["ignored/"] } },
  include: ["**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "nodup-island/tsconfig.json",
} satisfies DlintConfig;
