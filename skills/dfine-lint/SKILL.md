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

- Expect one `ts.Program` and `ts.TypeChecker`, built once and shared by every rule, as in `tsc`.
- Expect each rule as one `.ts` file, loaded at runtime from source via jiti, with no build step.
- Expect no ESLint, no language server and no separate AST.

## Principles

Applies to every dlint rule you write or change, since a rule that breaks one is flaky and unshippable.

- Resolve every question through `ctx.checker` and the TS AST, never through a wrapper AST.
- Answer no compiler question with a parallel parser or a regex, so results reproduce in every run.
- Decide on symbols, types and AST structure, never on an identifier spelling or a path substring.
- Use `resolveCallee`, `resolveSymbol`, `isTypeFromPackage` and `isLibDeclaration` for that.
- Use `isProjectSourceFile`, type flags and structural AST checks too, as `sdk-api.md` lists.
- Use a name check only as a cheap prefilter, because the resolved symbol or type decides.
- Write no per-file, per-name or per-example `if`, since a rule that needs one is wrong.
- Treat a finding on real code as a codebase bug, and fix the code, not the rule.
- Loosen a rule only for a true false positive, and only with a type or symbol condition.
- Build only on public compiler APIs, never on TypeScript internals.

## Rule or Config

Applies before any new rule, because dlint ships 86 universal rules and most are tunable.

1. Run `dlint --list-rules` for the id and description of every loaded rule, project rules included.
2. Grep the bundled rules and read the README rule table:
   - in the dlint repo at `dlint-rules/universal/`
   - in a project at `node_modules/@dfine-io-gmbh/dlint/dlint-rules/universal/`
3. Keep an existing rule that flags the concern, and enable its group if it is opinionated.
4. Set a wrong threshold, list, allow-set, method set or route pair in `ruleOptions`.
5. Never copy a universal rule into a `rulesDir` to change a value, as the copy freezes stale logic.
6. Author a new rule only for a concern no rule covers, with an id that names the bug it finds.

- Name the existing rules you checked and why each one does not fit.

## Where to Look

| Task | Read |
| --- | --- |
| Write a rule: skeleton, context, CONFIG block, report, autofix | `references/authoring.md` |
| Find a helper, a type or the compiler fact behind a string check | `references/sdk-api.md` |
| Write a fixture, run the suite, add an island test | `references/testing.md` |
| Configure a project, set severities, ship a rule pack, use the CLI | `references/config-and-shipping.md` |

## Verify

Run the steps for where the rule lives, in order, and fix type errors first.

In the dlint repo, for a bundled rule:

1. Run `pnpm build`, so `tsc` compiles the engine clean.
2. Run `pnpm typecheck`, the only step that type-checks the rules, and expect 0 errors.
3. Run `pnpm lint:dlint`, so dlint lints itself to 0 errors and 0 warnings.
4. Run `bash tests/run.sh`, with every fixture passing, true and false positives alike.

In a project, for a rule in its `rulesDir`:

1. Run `npx tsc -p .dlint/tsconfig.json`, and expect 0 errors.
2. Run `npx dlint --rules <id> --files <file>` on a true positive and a near-miss.
   - See only the true positive flagged.
3. Run `npx dlint`, and read every new finding as a codebase bug or a rule to tighten.

- Never skip the type check, because jiti strips types and a type error hides as a wrong value.
