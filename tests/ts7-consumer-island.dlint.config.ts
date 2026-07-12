import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Proves dlint's jiti alias pins its bundled TS6 engine for CONSUMER rules even when the consumer
// project ships a TS7-native `typescript` (no in-process JS-API). tests/run.sh stages the stub into
// ts7-consumer-island/node_modules/typescript; the consumer rule (ts7-engine-probe) imports bare
// `typescript` and calls ts.isDebuggerStatement — it only resolves dlint's 6.x through the alias.
// Paths resolve relative to THIS file's directory (tests/).
export default {
  bundledRules: false,
  rulesDir: "ts7-consumer-island/consumer-rules",
  severity: "error",
  include: ["**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "ts7-consumer-island/tsconfig.json",
} satisfies DlintConfig;
