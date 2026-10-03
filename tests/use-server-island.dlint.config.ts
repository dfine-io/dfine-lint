import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// unnecessary-use-server reads the program-wide reverse import graph: a "use server" file that a client
// file reaches only through a barrel re-export keeps its directive. Paths resolve from tests/.
export default {
  include: ["**/*.ts"],
  tsconfig: "use-server-island/tsconfig.json",
} satisfies DlintConfig;
