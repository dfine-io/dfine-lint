# Testing dlint Rules

## Contents

- Fixtures - one file per rule, `EXPECT` markers
- Running - the harness and its blocks
- Extra blocks - checks beyond the fixtures
- Island tests - mechanics a flat fixture cannot model
- Done - when a rule change is finished

## Fixtures

Applies to every added or changed rule - the harness `tests/run.sh` needs no edit for a new one.

- Write one file per rule: `tests/fixtures/<id>.fixture.ts`, or `.tsx` for a JSX rule.
- Put a second fixture of the other extension into `tests/fixtures/variants/`.
- Know why: TypeScript keeps only the `.ts` of a same-folder `.ts` / `.tsx` pair.
- Mark each expected finding with `// EXPECT: <id>` on its line - two findings need two markers.
- Mark a finding reported on another line with `// EXPECT: <id>@<line>`.
- Expect every unmarked line to stay silent - it is the false-positive guard.
- Cover a true positive, marked, and a near-miss that looks similar but is correct, unmarked.
- Import the real package a rule identifies (`zod`, `drizzle-orm`, `axios`) - a stand-in fails.

```typescript
// A simplified sketch - the real tests/fixtures/no-floating-promises.fixture.ts differs
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

- Run `pnpm build` first - the harness drives `build/cli.js` (or `$DLINT_CLI`), never the source.
- Run one rule while iterating: `bash tests/run.sh <id>`.
- Run the whole suite as the gate: `bash tests/run.sh`.
- Check the PASS count of a filtered run - a misspelled id or block runs 0 checks and exits 0.
- Filter a block by its block name - it is not always the island folder.
- Expect the block names in the table below - the extra blocks run under their rule id.

| Block names |
| --- |
| `workspace`, `nodup`, `ts7-alias`, `options`, `config-resolve`, `sdk-contract` |
| `cli-robustness`, `config-guard`, `list-rules`, `rules-tsconfig`, `use-server-island` |
| `rule-loading`, `git-guard`, `fix-island`, `severity` |

- Expect each fixture to lint with `--rules <id> --files <its path>`, compared per line to `EXPECT`.
- Expect a rule that reports one problem twice to fail - the per-line count catches the duplicate.
- Expect `tests/dlint.config.ts` to enable `opinionated` - every rule loads in tests unchanged.
- Expect that config to set `rulesDir: "../dlint-rules/universal"`.
- Expect it to set `include: ["fixtures/**/*.ts"]`.
- Expect it to set `ruleOptions: { "semantic-clone": { minParams: 0 } }` as well.

## Extra blocks

Applies to the checks in the main test program that run under their rule id.

| Block | Pins |
| --- | --- |
| `banned-syntax:delete-global-once` | a delete on a global, parenthesized or not, is one finding |
| `unused-export:import-options` | an export reached only via `import("./x", options)` in `fixtures/unused-export.dynamic.ts` is not reported |
| `no-local-constants:root-constants` | `tests/constants/` counts as a root `constants/` folder |
| `promise-all-opportunity:import-message` | a dynamic import is named by its specifier |
| `effect-cleanup:recursion-graph` | nine mutually calling helpers and a 20-step ladder (`fixtures/effect-cleanup.graph.tsx`) lint clean, under 15 s, exit 0 |

## Island tests

Applies to a rule or mechanic that depends on the project root or on config.

- Add an island dir with its own `app/` or `src/`, a `tsconfig` and a `.dlint.config.ts`.
- Run each island from its own directory.
- Call `island_check` in `tests/run.sh` - it runs dlint with `--config` against the markers.

| Island or block | Proves |
| --- | --- |
| `tests/route-boundary-island/` | `route-boundary` keys off `app/<route>/...`; runs from inside and from the root with `--path` |
| `tests/workspace-island/` | a workspace package linked into `node_modules` is project code: the export `app/main.ts` imports through the link stays used; the block stages the link |
| `tests/config-resolve-island/` + `config-resolve-island.dlint.config.ts` | `--config <file>` resolves `rulesDir` + `tsconfig` relative to the config's directory |
| `tests/options-island/` + `options-island.dlint.config.ts` | `ruleOptions` change behaviour without a copy: `max-file-lines` fires on a small file only because `maxLines: 5` is set; `effect-cleanup`'s `cleanupMap` takes one name instead of a list |
| `tests/severity-island/` (`severity`) | one temporary git copy, a config per case: groups, overrides (rule, sub-check, file-scoped, last wins), `meta.severity`, `isSubCheckDisabled`, a rules-dir path id and `include` (globs, `--files` directories, no match) decide each severity; `rules/sub/probe.ts` is its rule |
| `tests/nodup-island/` + `nodup-island.dlint.config.ts` | `no-duplicate-schema-export`'s `ignorePaths` silences a mirror while a real duplicate fires |
| `tests/cli-error-island/` | broken tsconfigs, picked per case via `DLINT_GUARD_TSCONFIG` - invalid JSON, a broken base, no files, a missing or unreadable file - exit 2 with a friendly `dlint:` message; an unknown compiler option only warns; a disabled `--rules` id and a missing `--config` or `--files` entry exit 2 |
| `tests/ts7-consumer-island/` + `ts7-consumer-island.dlint.config.ts` | a TS7-style stub `typescript` (no in-process JS API) staged into `node_modules`; a consumer rule importing bare `typescript` still resolves dlint's bundled engine |
| `tests/list-rules-island/` + `list-rules-length` / `list-rules-nodesc` configs | an over-long description is reported, a rule without one is skipped and named, exit 0; the 120-char limit is the harness's `LR_CHECK` - dlint itself loads a longer description without complaint |
| block `rules-tsconfig` | `tsconfig.rules.json` exists, parses, maps `typescript` to dlint's copy, is reachable via `files` and `exports` |
| `tests/sdk-contract-island/` + `sdk-contract-island.dlint.config.ts` | pins helpers no bundled rule uses: `isInConditionalBranch`, `isLibDeclaration`, `isFromPackage`, `valueSymbolOf` on a shorthand default value, the `resolveCallee` fields, `isTypeFromPackage`, `extendsLibType`, `isDbCall` without a package; plus an `--extract` run over an exported arrow function |
| `tests/fix-island/` | `--fix` on copies of the input files (`--files`, no git) - the cases below |
| `tests/use-server-island/` + `use-server-island.dlint.config.ts` | a "use server" file reached by a client file only through a barrel re-export is not reported by `unnecessary-use-server` |
| block `git-guard` | git modes in temporary repositories - the cases below |
| block `rule-loading` | every bundled rule loads without a skipped rule, and a consumer rule exported through `module.exports` (`sdk-contract-island/consumer-rules`) still loads |

### fix-island cases

- Expect the first cases to run without a config.
- Expect each fixed copy there to match its `.expected.ts`, a byte order mark kept.
- Expect no write through a symlink out of the copy.
- Expect stdout to stay valid JSON with per-rule `timings` under `--benchmark`.
- Expect the report to be the re-lint after fixing.
- Expect `--format html` on the unfixed copy to exit 1 with the timing on stderr.
- Expect the copy to get a config next.
- Expect the opinionated group to fix `merge.ts`: duplicate imports, a bare self-import.
- Expect it to fix the constructors in `merge.ts` too.
- Expect the consumer rule `fix-overlap-probe` to pin that a fix lands whole or not at all.
- Expect it to pin that `insertBefore` and `insertAfter` keep the leading trivia.
- Expect separate copies for the next checks.
- Expect an ES2021 lib to get no `Object.hasOwn` suggestion.
- Expect `verbatimModuleSyntax` to keep `import { type T }` as a cycle edge.
- Expect it to keep `export { type T } from` as a cycle edge too.
- Expect `stale-sdk`: a project rule gets the running dlint's SDK past an older stub install.
- Expect `files-ignore`: `--files` takes `./` and `../` paths.
- Expect it to name the ignore pattern that skips a file.

### git-guard cases

- Expect no repository, an unknown base branch and a base with `..` or a leading `-` to exit 2.
- Expect a shallow `--commit` to exit 2 - each failure with its own message.
- Expect an unborn HEAD, a root commit and a subdirectory project to lint the expected files.
- Expect file names with quotes or umlauts to lint the expected files.
- Expect `--branch` against a local base to lint its diff.
- Expect `maxFileSize` to drop a big file from the full scan, `--changed`, `--commit`, `--branch`.
- Expect `maxFileSize` never to drop a file named with `--files`.

## Done

Applies to every rule change.

- Finish only with `bash tests/run.sh` fully green, the changed rule's fixture included.
- Finish only with `pnpm build`, `pnpm typecheck` and `pnpm lint:dlint` at 0 errors, 0 warnings.
- Expect `pnpm typecheck` as the only step that type-checks a bundled rule in dfine-lint.
- Know why: `tsconfig.typecheck.json` includes `dlint-rules/`, the main build does not.
- Check a project rule pack with `npx tsc -p .dlint/tsconfig.json` instead.
