# Changelog

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
