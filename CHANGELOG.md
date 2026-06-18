# Changelog

## Unreleased

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
