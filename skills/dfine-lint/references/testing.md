# Testing dlint rules

The harness is `tests/run.sh`. It is a scalable true-positive / false-positive gate: add a
rule's coverage by dropping in a fixture file - no harness edits needed.

## Fixture convention

- One file per rule: `tests/fixtures/<id>.fixture.ts` (or `.tsx` for JSX rules).
- Put a rule's second fixture in the other extension into `tests/fixtures/variants/`: TypeScript
  keeps only the `.ts` of a same-folder `x.fixture.ts` / `x.fixture.tsx` pair.
- Add one `// EXPECT: <id>` per expected finding on its line; two findings on one line need two markers.
  - Default: the finding is expected on that same line.
  - Override the line: `// EXPECT: <id>@<line>` (e.g. when the rule reports on a different node).
- Every other line must not be flagged. Lines without an `EXPECT` are the false-positive
  guard - a rule that fires on them fails the test.

So a good fixture contains BOTH:

1. True positives - the real bug, marked with `EXPECT`.
2. Near-miss false positives - code that looks similar but is correct, left unmarked, to
   prove the rule discriminates (this is where principle 2, "no string heuristics", is
   actually verified).

Example (`tests/fixtures/no-floating-promises.fixture.ts`):

```typescript
async function load() {
  return 1;
}

load(); // EXPECT: no-floating-promises
await load(); // fine - awaited, must NOT flag
void load(); // fine - explicitly voided
const p = load();
await p; // fine - captured then awaited
```

## Running

- One rule (fast loop while iterating): `bash tests/run.sh <id>`
- Whole suite (the gate): `bash tests/run.sh`

Under the hood each fixture is linted with `--rules <id> --files <its path under tests/>` and the
reported lines are compared to the `EXPECT` markers, counted per line. Exact match = PASS.

- Expect a rule that reports one problem twice to fail - the count catches the duplicate.
- Import the real package a rule identifies (`zod`, `drizzle-orm`, `axios`) - a local stand-in no longer matches.

Opinionated rules: `tests/dlint.config.ts` enables the `opinionated` group, so every rule
loads during testing even though that group ships off for end users. If you add an
opinionated rule, no test change is needed - it is already covered.

Extra blocks in the main test program:

- `banned-syntax:delete-global-once` - a delete on a global, parenthesized or not, is one finding.
- `unused-export:import-options` - an export reached only through `import("./x", options)` in
  `fixtures/unused-export.dynamic.ts` must not be reported.
- `no-local-constants:root-constants` - `tests/constants/` is a root `constants/` folder.
- `promise-all-opportunity:import-message` - a dynamic import is named by its specifier.
- `effect-cleanup:recursion-graph` - nine mutually calling helpers and a 20-step ladder of double
  calls (`fixtures/effect-cleanup.graph.tsx`) lint cleanly, under 15 s and with exit code 0.

## Island tests (when a flat fixture can't express it)

Some rules depend on the project root or on config mechanics that the flat `fixtures/` dir
can't model. Those live in dedicated "islands" with their own `app/`/`src/` + `tsconfig` +
sometimes a `dlint.config.ts`, run from that directory:

- `tests/route-boundary-island/` - `route-boundary` keys off path segments relative to the
  project root (`app/<route>/...`), so its fixture needs a real `app/` layout. It runs twice:
  from inside the island and from the repo root with `--path`.
- `tests/workspace-island/` - a workspace package linked into `node_modules` is project code: the
  export `app/main.ts` imports through the link stays used. The block stages the link itself.
- `tests/config-resolve-island/` + `config-resolve-island.dlint.config.ts` - proves
  `dlint --config <file>` resolves `rulesDir` + `tsconfig` relative to the config's
  directory (run-from-anywhere).
- `tests/options-island/` + `options-island.dlint.config.ts` - proves `ruleOptions` changes
  behavior without copying a rule (e.g. `max-file-lines` fires on a small file only because
  `maxLines: 5` is set), and that `effect-cleanup`'s `cleanupMap` takes one name instead of a list.
- `tests/severity-island/` (block `severity`) - one temporary git copy, a config per case, pins how groups,
  overrides (rule, sub-check, file-scoped, last entry wins), `meta.severity`, `isSubCheckDisabled`, a
  rule named by its `rulesDir` path and `include` (globs, `--files` directories, no match) decide
  each finding's severity; `rules/sub/probe.ts` is the project rule it needs.
- `tests/nodup-island/` + `nodup-island.dlint.config.ts` - proves `no-duplicate-schema-export`'s
  `ignorePaths` option silences a mirrored copy while a real duplicate still fires.
- `tests/cli-error-island/` - broken tsconfigs, picked per case via `DLINT_GUARD_TSCONFIG`: invalid
  JSON, a broken base, no files, a missing or unreadable file all exit 2 with a friendly `dlint:`
  message; an unknown compiler option only warns. Also covers `--rules` for a disabled rule and a
  missing `--config` or `--files` entry (exit 2).
- `tests/ts7-consumer-island/` + `ts7-consumer-island.dlint.config.ts` - a TS7-style stub
  `typescript` (no in-process JS API) staged into `node_modules`; proves a consumer rule importing
  bare `typescript` still resolves dlint's own bundled engine.
- `tests/list-rules-island/` + `list-rules-length` / `list-rules-nodesc` configs - drive the
  failure branches of `--list-rules`: an over-long description must be reported, and a rule with no
  description must be skipped and named while the run still exits 0.
- `tests/sdk-contract-island/` + `sdk-contract-island.dlint.config.ts` - a probe rule pins SDK helpers
  no bundled rule exercises (`isInConditionalBranch`, `isLibDeclaration`, `isFromPackage`,
  `valueSymbolOf` on a shorthand default value, the fields of `resolveCallee`, `isTypeFromPackage`,
  `extendsLibType`, and `isDbCall` without a package), plus an `--extract` run over an exported
  arrow function.
- `tests/fix-island/` - `--fix` on copies of the input files (`--files`, no git). Without a config:
  each fixed copy must match its `.expected.ts`, a byte order mark stays in place, a symlink out of
  the copy is never written, stdout stays valid JSON with per-rule `timings` under `--benchmark`,
  the report is the re-lint after fixing, and `--format html` on the unfixed copy exits 1 with the
  timing on stderr. Then the copy gets a config: the opinionated group fixes `merge.ts`
  (duplicate imports, a bare self-import, constructors), and the consumer rule `fix-overlap-probe`
  pins that a fix lands whole or not at all and that `insertBefore`/`insertAfter` keep the leading
  trivia. Separate copies check that an ES2021 lib gets no `Object.hasOwn` suggestion and that
  `verbatimModuleSyntax` keeps `import { type T }` and `export { type T } from` as cycle edges.
  Two more copies: a project rule gets the running dlint's SDK although an older stub install
  sits in its `node_modules` (stale-sdk), and `--files` takes `./` and `../` paths and names the
  ignore pattern that skips a file (files-ignore).
- `tests/use-server-island/` + `use-server-island.dlint.config.ts` - a "use server" file reached
  by a client file only through a barrel re-export must not be reported by `unnecessary-use-server`.
- git modes (`tests/run.sh` block `git-guard`) run in temporary repositories: no repository, an
  unknown base branch, a base with `..` or a leading `-` and a shallow `--commit` exit 2, each with
  its own message; an unborn HEAD, a root commit, a subdirectory project and file names with
  quotes or umlauts lint the expected files, `--branch` against a local base lints its diff, and
  `maxFileSize` drops an oversized file from the full scan, `--changed`, `--commit` and `--branch`,
  never from `--files`.
- rule loading (block `rule-loading`): every bundled rule loads without a skipped rule, and a
  consumer rule exported through `module.exports` (`sdk-contract-island/consumer-rules`) still loads.

Pattern for a new mechanic test: add the island dir + a `.dlint.config.ts`, then call
`island_check` in `tests/run.sh`; it runs dlint with `--config` and compares findings to the
island file's `EXPECT` markers.

## What "done" looks like

A rule change is not done until:

- `bash tests/run.sh` is fully green (the new/changed rule's fixture included), and
- the broader verification passes (`pnpm build`, `pnpm typecheck`, self-lint `0/0`) - see
  SKILL.md "Verify". Remember `pnpm typecheck` is the only step that type-checks the rule
  itself; jiti would otherwise let a type error hide as a silent wrong-value bug.
