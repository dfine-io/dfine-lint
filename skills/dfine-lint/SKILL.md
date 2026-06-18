---
name: dfine-lint
description: >-
  Author, test, configure, and ship rules for dfine-lint (dlint) - the semantic TypeScript
  linter that runs directly on the TS Compiler API and TypeChecker (no ESLint/AST layer).
  Use this skill WHENEVER the work touches dlint: writing or changing a rule in
  dlint-rules/ or a project rulesDir, building a rule via defineRule, writing rule fixtures
  or running tests/run.sh, configuring dlint.config.ts (severity, groups, ruleOptions,
  overrides), building a project rule pack / plugin, or reasoning about the dlint SDK
  helpers (ctx.checker, ctx.walk, resolveSymbol, isFromPackage, etc.). Trigger it even when
  the user just says "add a lint rule", "catch X with the type checker", "make a dlint
  rule", "tune a rule for our repo", or "why is this rule firing" - dlint has hard
  principles and a no-duplication gate that are easy to violate without this skill.
---

# dlint - authoring, testing, configuring, and shipping rules

dlint is a semantic TypeScript linter built **directly on the TypeScript Compiler API and
TypeChecker** - the same `ts.Program` / `ts.TypeChecker` that `tsc` uses. There is no ESLint,
no Language Server, no separate AST. Each rule is one `.ts` file loaded at runtime via jiti
(shipped as source). The engine builds the program once and shares it across every rule.

Read this whole file first. For depth, load the reference files as noted:

- `references/sdk-api.md` - rule context, `defineRule`, helper catalogue, deterministic patterns.
- `references/testing.md` - fixtures, `// EXPECT` markers, `tests/run.sh`, island tests.
- `references/config-and-shipping.md` - `DlintConfig`, precedence, `groups`, `ruleOptions`.

## The three principles - non-negotiable

Every rule you touch must hold all three. They are what makes dlint trustworthy as a
zero-config CI gate; violating them produces flaky, un-shippable rules.

**1. Compiler-exclusive: stay maximally close to the TypeChecker, add no abstraction.**
Resolve through `ctx.checker` and the TS AST directly. Never introduce a wrapper AST, a
parallel parser, or a regex over source text to answer a question the compiler can answer.
If TypeScript knows it - the type, the symbol, the import origin, the nullability - ask the
compiler. This is why the type information a rule sees is identical to the compiler's, and
why results are reproducible.

**2. No string heuristics: deterministic, dynamic, scalable.**
A rule must not key off identifier spellings, path substrings, or "this looks like X" name
matching to decide whether code is a bug. Use symbol resolution (`resolveSymbol`,
`isFromPackage`, `isLibDeclaration`, `isNodeModulesDeclaration`), type flags, and structural
AST checks. A correct rule needs **no per-case `if`-patches** - if you find yourself
special-casing a specific file, name, or example to make a finding go away, the rule is
wrong (or the finding is a real codebase bug - see G1.1 below). Determinism means: same
code + same types -> same findings, every run. This also makes a rule scale to any codebase,
not just the one in front of you.

**3. No duplication: before authoring a new rule, prove no existing rule covers it.**
dlint ships ~89 universal rules, and most tunable values are exposed via `ruleOptions` - a
project changes a threshold, list, or allow-set without copying the rule. Before writing a
new rule, check:

- **Already detected?** Grep `dlint-rules/universal/` and read the README rule table.
- **Coverable by `ruleOptions`?** A threshold, allow/deny list, method set, route pairs, or
  id allow-list - if yes, configure it; do not create a near-duplicate and do not copy a
  universal rule into a `rulesDir` just to change a value.
- **Genuinely new concern?** Only then author a rule, with a descriptive id naming the bug (G1.4).

State which existing rules you checked and why they do not fit before creating anything new.

### Rule philosophy (carry these too)

- **G1.1** A finding is a codebase bug, not a rule bug - fix the code, not the rule. Only
  loosen a rule when it is a true false positive, and fix it generically, never per-case.
- **G1.3** Avoid unreliable edge-case compiler APIs; don't build a rule on something that
  only works in narrow cases.

## Before you start: is this a new rule, or config?

```
Need to catch something or change behavior?
  - Existing universal rule already flags it?
      - Right behavior       -> enable/keep it (check the opinionated group; see config ref).
      - Wrong threshold/list -> set it in ruleOptions (no copy, no new rule).
  - No rule covers it (new concern) -> author a new rule (below).
```

## Authoring a rule

A rule is one file: `dlint-rules/universal/<id>.ts` (bundled) or `<rulesDir>/<id>.ts`
(project). The **id is the filename**. Skeleton:

```typescript
import ts from "typescript";
import { defineRule, resolveSymbol, isFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - defaults; a project overrides these via ruleOptions["<id>"]
// ===========================================================================
const MIN_CALLERS = 2;
// ===========================================================================

export default defineRule({
  meta: {
    category: "performance", // "security" | "performance" | "quality" | "architecture"
    description: "What the rule enforces, one line",
    // severity?: "error" | "warning"   // optional in-rule default
    // subChecks?: number               // if the rule bundles several checks
  },
  check(ctx) {
    // Tunable values: read ctx.options with the CONFIG const as the default (principle 3).
    const minCallers = (ctx.options.minCallers as number) ?? MIN_CALLERS;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression))
        return;
      // Verify origin via symbol/type resolution, NOT by name string (principle 2).
      if (!isFromPackage(node.expression, ctx.checker, "react")) return;
      // ... structural + type checks ...
      ctx.reportAt(node, `Human-readable problem and fix`, {
        action: "short-action-id",
        pattern: "How to fix it",
        // reference?: "https://...",
        // fix?: <TextChange | TextChange[]>  // optional autofix
      });
    });
  },
});
```

Key context (full catalogue in `references/sdk-api.md`):

- `ctx.program`, `ctx.checker`, `ctx.sourceFile`, `ctx.referenceIndex` - the shared compiler state.
- `ctx.walk(node => ...)` - visit every node in the current file.
- `ctx.reportAt(node, message, advisory?)` - flag a problem at a node.
- `ctx.createFix / insertBefore / insertAfter / deleteNode` - build `fix` TextChanges (autofix).
- `ctx.isSubCheckDisabled(subCheckId)` - gate a sub-check inside a multi-check rule.
- `ctx.options` - per-rule project overrides; read as `ctx.options.x ?? DEFAULT`.

Authoring rules:

- Put tunable values in a single `CONFIG` banner block at the top, and read them via
  `ctx.options` so a project tunes them without copying the rule.
- Resolve cross-file/symbol questions with the helpers; never with name or path strings.
- Keep each rule self-contained - duplication between rule files is intentional (rules are
  isolated and shareable); shared logic lives only in the SDK helpers, not copied between rules.

## Testing a rule (always)

Every added or changed rule needs a fixture. Convention:

- `tests/fixtures/<id>.fixture.ts` (or `.tsx`) - self-contained code.
- Mark each line that must be flagged with `// EXPECT: <id>` (optionally `// EXPECT: <id>@<line>`).
- Every other line must not be flagged - this is the false-positive guard.
- Run one rule: `bash tests/run.sh <id>` - or the whole suite: `bash tests/run.sh`.

Cover both a true positive (the bug fires) and a near-miss false positive (a similar-but-fine
line stays silent). Details + island tests (route-boundary, config-resolve, options) in
`references/testing.md`.

## Configuring / shipping (rule packs & plugins)

A project consumes dlint via `dlint.config.ts`: bundled universal rules load automatically,
and a `rulesDir` adds project-specific rules (a "rule pack"/plugin) - a project rule with the
same id overrides a bundled one. Tune behavior with:

- `groups` - toggle a whole set with one severity (the built-in `opinionated` group ships off).
- `ruleOptions` - per-rule tunable values, keyed by rule id (the no-copy override path).
- `overrides` - per-rule severity, optionally file-scoped.

Severity precedence (most specific wins): per-rule `override` -> in-rule `meta.severity` ->
`group` -> global default. Full schema, the opinionated-group list, and how to build a
shareable rule pack are in `references/config-and-shipping.md`.

## Verify (run in order; fix task-related errors first)

1. `pnpm build` - `tsc` compiles the engine clean (strict baseline).
2. `pnpm typecheck` - type-checks the **rules** too (the main build only covers `src/`; this
   config also includes `dlint-rules/`). Expect 0 errors.
3. `node build/cli.js --format compact` (or `pnpm lint:dlint`) - dlint self-lints clean (0/0).
4. `bash tests/run.sh` - all fixtures pass (true + false positives).

Note: jiti strips types at runtime, so a type error in a rule will NOT crash a test - it can
hide as a silent wrong-value bug. That is exactly why step 2 (`pnpm typecheck`) is mandatory
after any rule change, not just `pnpm build`.
