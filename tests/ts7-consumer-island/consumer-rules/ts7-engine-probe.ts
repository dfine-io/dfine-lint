// A CONSUMER project rule (loaded by jiti from this island dir, not from dlint's package). It relies
// on the in-process TypeScript JS-API via a bare `import ts from "typescript"` and the ts.isX guards.
// On a TS7-native consumer the bare import resolves the API-less TS7 package (ts.isDebuggerStatement
// is undefined) and this rule would crash, taking the whole run with it. dlint's jiti alias
// (src/config/loader.ts) pins its bundled TS6 for every jiti-loaded rule, so this rule resolves a
// working compiler and fires. This island is the regression guard for that alias.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Flag debugger statements — probes that a consumer rule resolves dlint's TS engine",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (ts.isDebuggerStatement(node)) {
        ctx.reportAt(node, "Remove debugger statement");
      }
    });
  },
});
