# Testing dlint rules

The harness is `tests/run.sh`. It is a scalable true-positive / false-positive gate: add a
rule's coverage by dropping in a fixture file - no harness edits needed.

## Fixture convention

- One file per rule: `tests/fixtures/<id>.fixture.ts` (or `.tsx` for JSX rules).
- On each line that must be flagged, add `// EXPECT: <id>`.
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

Under the hood each fixture is linted with `--rules <id> --files fixtures/<base>` and the
reported lines are compared to the `EXPECT` lines. Exact match = PASS.

Opinionated rules: `tests/dlint.config.ts` enables the `opinionated` group, so every rule
loads during testing even though that group ships off for end users. If you add an
opinionated rule, no test change is needed - it is already covered.

## Island tests (when a flat fixture can't express it)

Some rules depend on the program root or on config mechanics that the flat `fixtures/` dir
can't model. Those live in dedicated "islands" with their own `app/`/`src/` + `tsconfig` +
sometimes a `dlint.config.ts`, run from that directory:

- `tests/route-boundary-island/` - `route-boundary` keys off path segments relative to the
  program root (`app/<route>/...`), so its fixture needs a real `app/` layout.
- `tests/config-resolve-island/` + `config-resolve-island.dlint.config.ts` - proves
  `dlint --config <file>` resolves `rulesDir` + `tsconfig` relative to the config's
  directory (run-from-anywhere).
- `tests/options-island/` + `options-island.dlint.config.ts` - proves `ruleOptions` changes
  behavior without copying a rule (e.g. `max-file-lines` fires on a small file only because
  `maxLines: 5` is set).

Pattern for a new mechanic test: add the island dir + a `.dlint.config.ts`, then add a small
block to `tests/run.sh` (mirror the `config-resolve` / `options` blocks) that runs dlint with
`--config` and compares findings to the island file's `EXPECT` markers.

## What "done" looks like

A rule change is not done until:

- `bash tests/run.sh` is fully green (the new/changed rule's fixture included), and
- the broader verification passes (`pnpm build`, `pnpm typecheck`, self-lint `0/0`) - see
  SKILL.md "Verify". Remember `pnpm typecheck` is the only step that type-checks the rule
  itself; jiti would otherwise let a type error hide as a silent wrong-value bug.
