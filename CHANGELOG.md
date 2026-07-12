# Changelog

## 1.5.1

### Fixed

- **Consumer rules resolve dlint's bundled TypeScript.** A project rule loaded from your `rulesDir`
  that imports `typescript` now always resolves dlint's bundled 6.x engine, not your project's
  compiler. On a TS7/`tsgo` project the bare import previously resolved the API-less TS7 package and
  crashed the run on the first rule. Bundled rules were already safe; this closes the same gap for
  consumer rules.
- **`no-db-antipatterns` no longer flags chunked inserts as N+1.** A `db.insert(...).values(chunk)`
  inside a loop is a deliberate multi-row batch, not a per-row N+1. The N+1 check now covers only
  `select`/`update`/`delete` — the operations `inArray()` batching actually rewrites.
- **`no-await-in-finally` only fires when the `try` has no `catch`.** `try { } catch { } finally
  { await ... }` is no longer flagged: the try error is already handled in the catch, so an awaited
  best-effort cleanup cannot mask it. A catch-less `try { } finally { await ... }` is still flagged.
- **`no-redundant-zod-parse` no longer flags `.safeParse()`.** Choosing `safeParse` means handling a
  possible failure, so it is always a validation boundary. Only `.parse()` is checked now.

## 1.5.0

### Changed

- **dlint ships its own TypeScript engine.** `typescript` moves from a peer dependency to a
  bundled dependency pinned to the last JavaScript-based line (`^6.0.3`). dlint now lints projects
  independently of the compiler they build with — including projects on the Go-native TypeScript 7
  (`tsgo`), whose package no longer exposes the in-process `createProgram`/`getTypeChecker` API that
  dlint's 86 rules run on. No config change needed, and consumers no longer need their own
  JavaScript `typescript` installed. A port to the native TS 7.1 API is on the roadmap.

## 1.4.0

### Added

- **`no-duplicate-schema-export` gains an `ignorePaths` option.** Files whose path includes a
  configured fragment are excluded from the duplicate scan — for a deliberately-mirrored,
  separately-bundled module whose copies never mix at runtime (e.g. an isolated `worker/`):
  `ruleOptions: { "no-duplicate-schema-export": { ignorePaths: ["worker/"] } }`. Real in-program
  duplicates are still flagged; default is `[]` (no behavior change for existing configs).

## 1.3.0

### Removed

- **Three CSS-Modules styling rules retired** from the universal set: `css-class-existence`,
  `no-css-properties`, and `no-static-inline-style`. They encoded a CSS-Modules styling stance,
  not a codebase-agnostic bug — `no-static-inline-style` even hardcoded an `app/styles/*.module.css`
  path in its message. A project that wants these conventions should ship them as project-specific
  rules in its own `rulesDir`. Built-in rule count: **89 → 86** (61 default + 25 opinionated).
  - A `dlint.config.ts` that referenced these ids (e.g. an `overrides` entry) keeps working — a
    stale rule-id override is a no-op; remove it at your convenience.

## 1.2.0

### Added

- **Rule groups** (`groups`): bundle rules under one severity and toggle them together. The package
  ships one built-in group, `opinionated`, set to `off`.
- **Per-rule options** (`ruleOptions`): override any rule's tunable values from `dlint.config.ts`
  without copying the rule, e.g. `ruleOptions: { "max-file-lines": { maxLines: 500 } }`.
- **Authoring skill** under `skills/dfine-lint` - a portable agent skill for writing, testing, and
  configuring rules.

### Changed

- **Opinionated rules now ship off by default.** ~27 style/architecture rules (plus a few
  opinionated sub-checks of `performance`, `typescript`, `no-implicit-coercion`) moved into the
  off-by-default `opinionated` group, so a zero-config run is a clean gate of universal bugs and
  framework-guarded checks - no false positives in a generic repo.
  - **Upgrading and want the previous behavior?** Re-enable them in `dlint.config.ts`:
    `groups: [{ id: "opinionated", severity: "error" }]`
- **CLI never prints a stack trace.** Any uncaught error becomes a one-line `dlint: <message>`
  with a non-zero exit code.
- All rules now type-check under the strict baseline (`pnpm typecheck`).

### Notes

- Existing configs keep working unchanged - the new fields are optional and their defaults live in
  the engine, so an old config automatically gets the new (sensible) defaults without edits.
