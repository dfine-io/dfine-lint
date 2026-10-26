---
name: dfine-lint
description: >-
  Authors, tests, configures and ships rules for dfine-lint (dlint), the semantic TypeScript
  linter that runs directly on the TS Compiler API and TypeChecker, with no ESLint or AST layer.
  Use it whenever the work touches dlint: writing or changing a rule in dlint-rules/ or a
  project rulesDir, building a rule via defineRule, writing rule fixtures or running
  tests/run.sh, configuring dlint.config.ts (severity, groups, ruleOptions, overrides),
  building a project rule pack, or reasoning about the dlint SDK helpers. Trigger it even when
  the user only says "add a lint rule", "catch X with the type checker", "make a dlint rule",
  "tune a rule for our repo" or "why is this rule firing" - dlint has hard principles and a
  no-duplication gate that are easy to break without this skill.
---

# dlint Handbook

## Engine

Applies to every question about how dlint runs a rule.

- Expect one `ts.Program` and `ts.TypeChecker`, built once and shared by every rule - as in `tsc`.
- Expect each rule as one `.ts` file, loaded at runtime from source via jiti - no build step.
- Expect no ESLint, no language server and no separate AST.

## Principles

Applies to every dlint rule you write or change - a rule that breaks one is flaky and unshippable.

- Resolve every question through `ctx.checker` and the TS AST - never a wrapper AST.
- Answer no compiler question with a parallel parser or a regex over the source.
- Know why: the rule then sees the compiler's own type information, so results reproduce.
- Decide on symbols, types and AST structure - never on an identifier spelling or a path substring.
- Use `resolveCallee`, `resolveSymbol`, `isTypeFromPackage`, `isLibDeclaration` for that.
- Use `isProjectSourceFile`, type flags and structural AST checks as well - see `sdk-api.md`.
- Know why: same code + same types -> same findings, in every run and every codebase.
- Use a name check only as a cheap prefilter - the resolved symbol or type decides.
- Write no per-file, per-name or per-example `if` - a rule that needs one is wrong.
- Prove no existing rule covers the concern before you author one - see "Rule or config".
- Name the existing rules you checked and why each one does not fit.
- Treat a finding on real code as a codebase bug - fix the code, not the rule.
- Loosen a rule only for a true false positive, and only with a type or symbol condition.
- Build only on public compiler APIs - never on TypeScript internals.

## Rule or config

Applies before any new rule - dlint ships 86 universal rules, most of them tunable.

1. Run `dlint --list-rules` - JSON id + description of every loaded rule, project rules included.
2. Grep `dlint-rules/universal/` and read the README rule table.
3. Keep an existing rule that already flags the concern - enable its group if it is opinionated.
4. Set a wrong threshold, list, allow-set, method set or route pair in `ruleOptions`.
5. Never copy a universal rule into a `rulesDir` to change a value - configure it instead.
6. Author a new rule only for a concern no rule covers - its id names the bug it finds.

## Where to look

| Task | Read |
| --- | --- |
| Write a rule: skeleton, context, CONFIG block, report, autofix | `references/authoring.md` |
| Find a helper, a type or the compiler fact behind a string check | `references/sdk-api.md` |
| Write a fixture, run the suite, add an island test | `references/testing.md` |
| Configure a project, set severities, ship a rule pack, use the CLI | `references/config-and-shipping.md` |

## Verify

Applies to every rule change - run the steps in order and fix task errors first.

1. Run `pnpm build` - `tsc` compiles the engine clean.
2. Run `pnpm typecheck` - the only step that type-checks the rules, expect 0 errors.
3. Run `pnpm lint:dlint` (`node build/cli.js --format compact`) - dlint lints itself to 0/0.
4. Run `bash tests/run.sh` - every fixture passes, true and false positives alike.

- Never skip step 2 - jiti strips types, so a type error hides as a silent wrong value.
