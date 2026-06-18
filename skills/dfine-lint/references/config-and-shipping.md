# dlint config & shipping (rule packs / plugins)

A project consumes dlint through `dlint.config.ts`. The bundled universal rules load
automatically; a project adds its own rules via `rulesDir`. Tuning happens via `groups`,
`ruleOptions`, and `overrides` - never by copying a universal rule.

## DlintConfig

```typescript
import type { DlintConfig } from "@dfine-io-gmbh/dlint";

export default {
  bundledRules: true, // load the package's universal rules (default; false to opt out)
  rulesDir: ".dlint/rules", // project rules (a rule pack); same id overrides a bundled rule
  severity: "error", // global default severity
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules", ".next", "build"],
  tsconfig: "./tsconfig.json",
  maxFileSize: 500_000,
  referencesDir: ".dlint/references",
  groups: [
    // toggle whole sets (see below)
    { id: "opinionated", severity: "error" },
  ],
  ruleOptions: {
    // per-rule tunable values (the no-copy override path)
    "max-file-lines": { maxLines: 500 },
    "route-boundary": {
      appDir: "src/app",
      allowedPairs: [["checkout", "cart"]],
    },
  },
  overrides: [
    // per-rule severity, optionally file-scoped
    { ruleId: "no-magic-numbers", severity: "warning" },
    { ruleId: "unused-export", severity: "off", files: ["db/", "/route.ts"] },
    {
      ruleId: "react:nested-component",
      severity: "off",
      files: ["components/ui/"],
    }, // sub-check
  ],
} satisfies DlintConfig;
```

## Severity precedence (most specific wins)

`per-rule override` -> `in-rule meta.severity` -> `group` -> `global default`.

- A rule resolved to `off` (by any layer) is not run.
- The engine exits non-zero when `errorCount > 0` (so dlint is a CI gate out of the box);
  `--no-error` reports without failing.

## groups

A group bundles rule ids (and `ruleId:subCheckId` members) under one severity.

- The package ships one built-in group, **`opinionated`**, with `severity: "off"`. It holds
  the ~27 style/architecture rules (and a few opinionated sub-checks of `performance`,
  `typescript`, `no-implicit-coercion`) that a generic project may not share. So a zero-config
  run is a clean gate of universal bugs + framework-guarded checks; the opinionated set is opt-in:
  ```typescript
  groups: [{ id: "opinionated", severity: "error" }]; // one line turns the whole set on
  ```
- A user group with the **same id** as a built-in re-sets its severity; a user group with a
  **new id** brings its own `rules` list - build your own concern bundles:
  ```typescript
  groups: [
    { id: "opinionated", severity: "error" },
    {
      id: "soft",
      severity: "warning",
      rules: ["no-base-to-string", "exhaustive-switch"],
    },
  ];
  ```

## ruleOptions - change a value WITHOUT copying the rule

Each tunable rule has a `CONFIG` block of defaults; a project overrides them by rule id.
The option key is the camelCase of the rule's CONFIG const (`MAX_LINES` -> `maxLines`,
`EXTERNAL_ID_NAMES` -> `externalIdNames`, `ALLOWED_PAIRS` -> `allowedPairs`). This is the
single-source override path - the rule's logic stays in the package and improves with
`pnpm update`. **Never copy a universal rule into `rulesDir` just to change a value** - that
creates an overlap that silently freezes stale logic. Copy/author a project rule only when
the concern is genuinely new.

To make a NEW rule's value tunable, read it as `ctx.options.x ?? DEFAULT` (see SKILL.md
authoring + sdk-api.md). To target a single sub-check, use a `ruleId:subCheckId` member in a
group or an override.

## Shipping a rule pack / plugin

A "plugin" is just a `rulesDir` of `.ts` rule files plus the `dlint.config.ts` that points at
it. Every `.ts` file in `rulesDir` (subdirs included) becomes a rule; the id is the filename.
A project rule with the same id as a bundled rule **overrides** it - but prefer `ruleOptions`
over an override-copy (see above). The rules load from source via jiti, so there is no build
step for the rule pack; it ships and updates as plain `.ts`.

When packaging for reuse across repos: keep each rule self-contained (it may only import from
`typescript` and `@dfine-io-gmbh/dlint`), put all tunables in a `CONFIG` block read via
`ctx.options`, and document the option keys. That makes the pack shareable without consumers
editing rule source.

## CLI quick reference

- `npx dlint` - full project scan; `--changed` / `--commit` / `--branch` for diffs.
- `npx dlint --files <path...>` - specific files/dirs.
- `--rules <id...>` - run only specific rules. (Note: a rule resolved `off` by a group won't
  load; enable its group or set a severity override to run it explicitly.)
- `--config <file>` - load this config; `rulesDir`/`tsconfig`/scan base resolve relative to it.
- `--format json|table|compact|html`, `--fix` (+ `--dry-run`), `--no-error`.
