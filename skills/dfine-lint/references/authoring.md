# Authoring a Rule

## Skeleton

Applies to every new rule - `dlint-rules/universal/<id>.ts` (bundled) or `<rulesDir>/<id>.ts`.

- Name the file after the rule id - the id is the filename.

```typescript
import ts from "typescript";
import { defineRule, resolveCallee } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - defaults; a project overrides these via ruleOptions["<id>"]
// ===========================================================================
const MIN_CALLERS = 2;
// ===========================================================================

export default defineRule({
  meta: {
    category: "performance", // "security" | "performance" | "quality" | "architecture"
    description: "What the rule enforces, one line", // required, under 120 chars
    // severity?: "error" | "warning"   // optional in-rule default
    // subChecks?: number               // if the rule bundles several checks
  },
  check(ctx) {
    const minCallers = (ctx.options.minCallers as number) ?? MIN_CALLERS;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node)) return;
      // Origin via symbol resolution, never a name string: aliases and React.x count
      const callee = resolveCallee(node, ctx.checker);
      if (callee?.packageName !== "react" || callee.name !== "cache") return;
      ctx.reportAt(node, `Human-readable problem and fix`, {
        action: "short-action-id",
        pattern: "How to fix it",
        // reference?: "https://...",
        // fix?: <TextChange | TextChange[]>
      });
    });
  },
});
```

## Rules

- Put every tunable value in the one `CONFIG` banner block at the top.
- Read each tunable as `ctx.options.<key> ?? DEFAULT` - a project tunes it without a copy.
- Resolve every cross-file or symbol question with an SDK helper - never with a name or path string.
- Import only from `@dfine-io-gmbh/dlint`, `typescript` and Node built-ins - never another rule.
- Keep each rule self-contained - duplicated code between rule files is intended, rules ship alone.
- Add a missing helper to the SDK (`src/helpers/`) and export it from `src/index.ts`.
- Never inline a one-off heuristic in a rule in place of that helper.

## Context

Applies to every `check(ctx)` - the full catalogue is `sdk-api.md`.

| Member | Use |
| --- | --- |
| `ctx.program`, `ctx.checker`, `ctx.sourceFile`, `ctx.referenceIndex` | shared compiler state |
| `ctx.walk(node => ...)` | visit every node of the current file |
| `ctx.reportAt(node, message, advisory?, subCheck?)` | flag a problem at a node |
| `ctx.createFix`, `insertBefore`, `insertAfter`, `deleteNode` | build the `fix` TextChanges |
| `ctx.isSubCheckDisabled(subCheckId)` | skip a sub-check the config turned off |
| `ctx.options` | the project's values for this rule's tunables |
| `ctx.projectRoot` | absolute root: `--path`, else the config's dir, else the cwd |
