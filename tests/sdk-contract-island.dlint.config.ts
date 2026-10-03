import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Pins SDK helpers that no bundled rule exercises: the consumer probe reports where a helper says yes,
// and the sample marks those lines with EXPECT. directive + tags drive the --extract check on
// actions.ts. Paths resolve relative to THIS file's directory (tests/).
export default {
  bundledRules: false,
  rulesDir: "sdk-contract-island/consumer-rules",
  severity: "error",
  include: ["**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "sdk-contract-island/tsconfig.json",
  directive: "use server",
  tags: ["probe"],
} satisfies DlintConfig;
