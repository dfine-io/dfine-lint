# Testing dlint Rules

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
- List the block names with `grep -o '"$ONLY" = "[a-z0-9-]*"' tests/run.sh`.
- Expect each fixture to lint with `--rules <id> --files <its path>`, compared per line to `EXPECT`.
- Expect a rule that reports one problem twice to fail - the per-line count catches the duplicate.
- Expect `tests/dlint.config.ts` to enable `opinionated` - every rule loads in tests unchanged.
- Read `tests/dlint.config.ts` for the harness's `rulesDir`, `include` and `ruleOptions`.

## Extra blocks and islands

Applies to a rule or mechanic a flat fixture cannot model - project root, config, CLI or git.

- Read the comment above each block in `tests/run.sh` - it states what the block proves.
- Expect an extra block of the main test program to run under its rule id.
- List `tests/` for the islands - each `<name>-island/` folder holds its own `app/` or `src/`.
- Add a new island as `tests/<name>-island/` plus `tests/<name>-island.dlint.config.ts` beside it.
- Call `island_check` in `tests/run.sh` - it lints from the repo root through `--config`.
- Expect `island_check` to compare the findings to the island file's `EXPECT` markers.

## Done

Applies to every rule change.

- Finish only with `bash tests/run.sh` fully green, the changed rule's fixture included.
- Finish only with `pnpm build`, `pnpm typecheck` and `pnpm lint:dlint` at 0 errors, 0 warnings.
- Expect `pnpm typecheck` as the only step that type-checks a bundled rule in dfine-lint.
- Know why: `tsconfig.typecheck.json` includes `dlint-rules/`, the main build does not.
- Check a project rule pack with `npx tsc -p .dlint/tsconfig.json` instead.
