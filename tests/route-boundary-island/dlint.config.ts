import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// Dedicated island for route-boundary: the rule keys off path segments relative to the
// program root and only runs for files under app/<route>/, which the flat fixtures/ dir
// cannot express. Run: node build/cli.js --path tests/route-boundary-island --rules route-boundary --files app/dashboard/importer.ts
export default {
  rulesDir: "../../dlint-rules/universal",
  severity: "error",
  // route-boundary is in the opinionated group — enable it for this test.
  groups: [{ id: "opinionated", severity: "error" }],
  include: ["app/**/*.ts"],
  exclude: ["node_modules"],
  tsconfig: "./tsconfig.json",
} satisfies DlintConfig;
