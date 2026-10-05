# dlint config & shipping (rule packs / plugins)

A project configures dlint through `dlint.config.ts`; without one the bundled defaults run. The
bundled universal rules load automatically; a project adds its own rules via `rulesDir`. Tuning
happens via `groups`, `ruleOptions`, and `overrides` - never by copying a universal rule.

## DlintConfig

```typescript
import type { DlintConfig } from "@dfine-io-gmbh/dlint";

export default {
  bundledRules: true, // load the package's universal rules (default; false to opt out)
  rulesDir: ".dlint/rules", // project rules (a rule pack); same id overrides a bundled rule
  severity: "error", // global default severity
  include: ["**/*.ts", "**/*.tsx"], // files to scan, exclude's syntax; at least one pattern needs an extension
  exclude: ["node_modules", ".next", "build"], // also skipped: the root .gitignore and .dlintignore
  tsconfig: "./tsconfig.json",
  maxFileSize: 500_000,
  referencesDir: ".dlint/references",
  extractorsDir: ".dlint/extractors", // extractor definitions for --extract
  baseBranch: "origin/main", // what --branch diffs against (default)
  tags: ["db.select", "^audit.*$"], // calls --extract tags; a plain string matches exactly, ^...$ is a regex
  directive: "use server", // only functions in files with this directive are tagged
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
    // per-rule severity, optionally file-scoped (files are path substrings, any severity)
    { ruleId: "no-magic-numbers", severity: "warning" },
    { ruleId: "complexity", severity: "warning", files: ["tests/"] },
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

`override` -> `in-rule meta.severity` -> `group` -> `global default`, the first that applies wins.
So a rule that declares `meta.severity` ignores its group; only an override turns it off. A rule
skips one sub-check's work through `ctx.isSubCheckDisabled(id)` when these settings make it `off`.

- An override whose `files` match the path beats a global one; the last matching entry wins.
- A sub-check takes its own `ruleId:subCheckId` override, else `off` when its rule's override is
  `off`, else its group, else its rule's severity: `opinionated` at `warning` makes its sub-checks
  warnings, and a rule override of another severity leaves them to their group.
- `include` does not narrow a file named with `--files`, but it does filter the files of a
  directory named there; when it matches no file of a full scan, the run exits 2.
- A rule id in `overrides` or `groups` may also be the rule's path below its rules dir
  (`universal/no-local-constants`); the engine maps it to the filename id.
- A finding whose severity resolves to `off` is dropped; a rule is not run in a file where it and
  every sub-check the config names are off.
- Exit codes: `0` no errors, `1` errors found (so dlint is a CI gate out of the box), `2` a
  usage or config error, an unknown or disabled `--rules` id, or a file set that cannot resolve.
  `--no-error` reports without failing.

## groups

A group bundles rule ids (and `ruleId:subCheckId` members) under one severity.

- The package ships one built-in group, **`opinionated`**, with `severity: "off"`. It holds
  the ~25 style/architecture rules (and a few opinionated sub-checks of `performance`,
  `typescript`, `no-implicit-coercion`, `prefer-modern-api`) that a generic project may not
  share. So a zero-config run is a clean gate of universal bugs + framework-guarded checks; the
  opinionated set is opt-in:
  ```typescript
  groups: [{ id: "opinionated", severity: "error" }]; // one line turns the whole set on
  ```
- A user group with the **same id** as a built-in re-sets its severity; given a `rules` list as
  well, that list **replaces** the built-in members instead of adding to them. A user group with
  a **new id** brings its own `rules` list - build your own concern bundles:
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
`CONSTANTS_DIR` -> `constantsDir`, `ALLOWED_PAIRS` -> `allowedPairs`); the one exception is
`safety`, whose `ARRAY_CALLBACK_METHODS_REQUIRING_RETURN` reads `arrayCallbackMethods`. This is the
single-source override path - the rule's logic stays in the package and improves with
`pnpm update`. **Never copy a universal rule into `rulesDir` just to change a value** - that
creates an overlap that silently freezes stale logic. Copy/author a project rule only when
the concern is genuinely new.

To make a NEW rule's value tunable, read it as `ctx.options.x ?? DEFAULT` (see SKILL.md
authoring + sdk-api.md). To target a single sub-check, use a `ruleId:subCheckId` member in a
group or an override; a rule passes that id to `reportAt` so the setting reaches its findings.

## Shipping a rule pack / plugin

A "plugin" is just a `rulesDir` of `.ts` rule files plus the `dlint.config.ts` that points at
it. Every `.ts` file in `rulesDir` (subdirs included, `.d.ts` skipped) becomes a rule; the id is
the filename alone, so two files of one name in different subdirs collide and the later one wins.
A project rule with the same id as a bundled rule **overrides** it - but prefer `ruleOptions`
over an override-copy (see above). The rules load from source via jiti, so there is no build
step for the rule pack; it ships and updates as plain `.ts`.

When packaging for reuse across repos: keep each rule self-contained (it imports from
`typescript`, `@dfine-io-gmbh/dlint` and Node built-ins such as `node:path`, as the bundled
rules do - never from another rule), put all tunables in a `CONFIG` block read via
`ctx.options`, and document the option keys. That makes the pack shareable without consumers
editing rule source.

## CLI quick reference

- `npx dlint init` - scaffold `dlint.config.ts`, `.dlint/rules/` and `.dlint/tsconfig.json`.
- `npx dlint` - full project scan; `--changed` / `--commit` / `--branch` (vs `baseBranch`) for diffs.
- `npx dlint --files <path...>` - specific files/dirs.
- `--path <dir>` - project root; loads `<dir>/dlint.config.ts` and beats `--config` as the base.
- `--rules <id...>` - run only specific rules. A rule resolved `off` by a group won't load, and
  naming it exits 2 ("Rule(s) turned off in config"); enable its group or set an override first.
- `--config <file>` - load this config; `rulesDir`/`tsconfig`/scan base resolve relative to it.
- `--format json|table|compact|html` (default `json`), `--no-error`. `html` writes a timestamped
  `.html` + `.json` pair to `.dlint/report/` and rejects `--fix` - run `--fix` first.
- `--help` / `-h` - the full flag list with exit codes.
- `--file-threshold <n>` - at `n` findings or more (default 300) the report goes to a temp file and
  stdout prints only `dlint: N errors, M warnings (...) -> <path>`; `0` turns this off.
- `--benchmark` - total, phase and per-rule timing (stderr; in json the `timings` field).
- `--extract` - extractor data as JSON instead of linting.
- `--fix` (+ `--dry-run`) - applies only behavior-keeping fixes, then lints again; the summary goes to stderr.
- `--list-rules` - the loaded rule set as JSON (id + description); no linting, no tsconfig needed.

## Type-checking a rule pack

jiti strips types at runtime, so an unchecked type error in a rule becomes a silent wrong value
rather than a crash. dlint ships `tsconfig.rules.json` for this; `dlint init` writes the pack side:

```json
{ "extends": "@dfine-io-gmbh/dlint/tsconfig.rules.json", "include": ["rules/**/*.ts"] }
```

Run it with `npx tsc -p .dlint/tsconfig.json`. The shipped config maps `typescript` to the compiler
dlint bundles, so rules are checked against the engine that actually runs them - necessary when the
project itself builds with a different TypeScript (a Go-native 7.x package carries no types).
