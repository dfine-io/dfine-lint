# Changelog

## 1.5.5

- Added SDK helpers `resolveCallee`, `isTypeFromPackage`, `extendsLibType` and `isProjectSourceFile` for custom rules
- Added `tokenBagSimilarity`, `classOrInterfaceOf` and `ctx.projectRoot` to the SDK
- Added a note when a file named with `--files` is skipped, with the ignore pattern and the file it comes from
- Added the opinionated check `prefer-modern-api:zod-validate`: `S.validate(v)` instead of `S.safeParse(v).success`
- Added any severity to `ruleId:subCheckId` overrides, so a single sub-check can be on, off or a warning
- Added `warning` and `error` to overrides with `files`, so a path can get its own severity or turn a rule on
- Added an optional sub-check id to `reportAt`, and a `subCheck` field to each finding a sub-check reports
- Changed rules to check what a call really is, not its name, so aliased imports and `React.useEffect` are found
- Changed rules to ignore your own functions named like a known API, such as `fetch`, `parse` or `useEffect`
- Changed findings in both directions after upgrading: dlint now sees more real calls and fewer lookalikes
- Changed the database rules to check drizzle-orm handles only, so other database clients are no longer reported
- Changed `safety` to report a shared variable read before an `await` and written after it, as ESLint does
- Changed `isDbCall` and `dbRootMethod` in the SDK to take an optional package name
- Changed `isLibDeclaration` in the SDK to also recognize built-ins extended with `declare global`
- Changed `bodyContainsCall`, `tokenSimilarity` to deprecated for `resolveCallee`, `tokenBagSimilarity`; gone in 2.0
- Changed `include` to match paths like `exclude` and `.gitignore`, so `src/**/*.ts` limits the scan to `src/`
- Changed a full scan whose `include` matches no file, such as `./src/**/*.ts`, to stop with exit code 2
- Changed a rule override to leave the sub-checks a group names at the group's severity; only `off` still reaches them
- Improved `input-validation` to accept zod's `validate()` and `validateAsync()` as validation
- Improved `promise-all-opportunity` to find destructured results (`const { a } = await ...`) and dynamic `import()`
- Improved `promise-all-opportunity` to check awaits in functions inside a `try` block
- Improved `unbranded-type-consistency` to report a `string` parameter, variable or return type fed only one brand
- Improved `unbranded-type-consistency` to follow the values passed in instead of matching names that end in `Id`
- Improved `rules-of-hooks`, `effect-cleanup` and `no-async-client-component` to also run in `.ts` files
- Improved the hooks rules to recognize a component by the React elements it returns
- Improved `rules-of-hooks` to allow React's `use()` in conditions and loops, but not in `try`/`catch`
- Improved `exhaustive-deps` to check arrow functions without braces
- Improved `effect-cleanup` to check `useLayoutEffect` and to accept cleanups in a helper function
- Improved `effect-cleanup` to accept `unobserve` and `removeListener` as cleanups
- Improved `no-dynamic-sql` to catch dynamic `sql.raw(...)` input; only a string literal or a const of one passes
- Improved `no-dynamic-sql` to find `sql.raw(...)` in nested templates, `sql.join`, stored fragments and `.append()`
- Improved `no-deprecated-api` to catch `Array.prototype.x = ...`
- Improved `error-handling` to cover every built-in error class that accepts `{ cause }`
- Improved `security` to read `href` values the way browsers do, so `java\tscript:` is caught
- Improved `performance` to treat any file that only re-exports as a barrel
- Improved `no-local-constants` and `no-duplicated-constants` to find a `constants/` folder at the project root
- Improved `no-local-constants` and `no-duplicated-constants` to respect `constantsDir`
- Improved `.gitignore`, `.dlintignore` and `exclude` patterns to treat escapes and trailing spaces like git
- Fixed group severities skipping sub-checks: `opinionated` set to `warning` no longer fails CI on any of them
- Fixed `tsconfig.rules.json` checking rules against a TypeScript 7 install under npm or yarn instead of dlint's own
- Fixed `promise-all-opportunity` suggesting parallel awaits when the second needs the first one's result
- Fixed `promise-all-opportunity` suggesting parallel awaits when the first result is unused and both share an input
- Fixed `promise-all-opportunity` messages containing file paths from your machine
- Fixed `semantic-clone` pairing functions that only share boilerplate, such as an `unknown` or all-optional input
- Fixed the clone rules matching code that repeats one call many times with code that makes it once
- Fixed `safety` reporting every `x = await f()` as a non-atomic update
- Fixed `no-deprecated-api` reporting polyfills and test stubs of built-in methods such as `scrollIntoView`
- Fixed `react` reporting a state update in an effect that already sits behind an `if` or an early `return`
- Fixed `state-hooks-cluster` treating a tab selector as a loading status
- Fixed `no-db-antipatterns` reporting `db.transaction()` on drivers other than Neon HTTP, which has no transactions
- Fixed `no-base-to-string` reporting tuples and `Error` subclasses
- Fixed `no-multiline-comments` reporting a comment twice
- Fixed `duplicate-import` treating `fs` and `node:fs` as different modules
- Fixed `route-boundary` and `no-client-data-fetch` matching partial path segments
- Fixed `no-client-server-only-import` reporting installed polyfills such as `events`
- Fixed `effect-cleanup` mixing up listeners on `window` and `document`
- Fixed `effect-cleanup` stopping the whole run on cleanup helpers that call each other many times over
- Fixed `rules-of-hooks` treating object methods and getters as part of the component they sit in
- Fixed `rules-of-hooks` calling a hook in a class member a module-level call; it now names the class
- Fixed `performance` checking `push` on values that are not arrays
- Fixed the unsafe-index check in `typescript` accepting keys that name no declared property
- Fixed your own project rules missing findings when a global or `npx` dlint runs against an older local install
- Fixed the `function-consumption` extractor listing imported calls under the importing file
- Fixed `--files` crashing on a path that starts with `./` or lies outside the project
- Fixed checks that never ran: synchronous file I/O in `performance` and prefer-rest-params in `syntax`
- Fixed checks that never ran: `route-boundary` with `--path` and `arguments.callee` in `no-deprecated-api`
- Fixed checks that never ran: the Promise executor checks in `safety`
- Removed the legacy octal check of `banned-syntax`, which TypeScript already rejects
- Removed the logger exemption of `no-floating-promises`
- Removed `data:` from the default `security` URL schemes; `ruleOptions.security.dangerousUrlSchemes` adds it back
- Removed the `externalIdNames` option of `unbranded-type-consistency`

## 1.5.4

- Added `--benchmark`: total time, phases and every rule, slowest first, on stderr
- Added the `--benchmark` timings to `--format json` as a `timings` field
- Added running without a config file: the bundled defaults apply; a `--config` naming a missing file still exits 2
- Added SDK helpers `dbRootMethod`, `ExportedFunction.func`, `resolveImportedModule` and `collectValueImports`
- Added SDK helpers `isTypeOnlyImport`, `isWriteTarget`, `valueSymbolOf` and `isSameReference`
- Added SDK helpers `isStringType` and `isThenable`
- Changed dlint to exit with code 2 when it cannot tell which files to lint; before, a CI gate saw "0 errors"
- Changed exit code 2 to cover a missing, unreadable or broken `tsconfig` and a config that includes no files
- Changed exit code 2 to cover failing git calls, such as no repository or an unfetched `--branch` base
- Changed the `tsconfig` lookup to the project directory only, never a parent directory
- Changed an unknown option in `compilerOptions`, such as a TypeScript 7 one, to a warning instead of an error
- Changed the file count to show only the files that were actually linted
- Changed a missing `--files` entry to exit with code 2 (was 1), for lint runs and `--extract`
- Changed `--fix` to apply only fixes that keep behavior, then lint again to show what is left
- Changed fixes that could change behavior, such as adding `await`, `??`, `?.` or `===`, to report-only
- Changed the `--fix` summary to go to stderr, so `--fix --format json` prints valid JSON
- Changed `--format html` to exit 1 when errors are found, like the other formats
- Changed `--fix` together with `--format html` to be rejected
- Changed `--file-threshold` to write `report.json` or `report.txt` into a fresh temp directory
- Changed `maxFileSize` to apply to `--changed`, `--commit` and `--branch` too
- Changed `maxFileSize` to never filter a path named with `--files`
- Changed `no-import-cycle` to leave a file that imports itself to `self-import`, so it is reported once
- Changed detection in both directions: a codebase clean on 1.5.3 can show findings on 1.5.4, and the reverse
- Improved speed: a full run of the 61 default rules on a 1,778-file project went from 37.0 s to 16.5 s
- Improved the speed of clone detection
- Improved `restrict-template-expr` to report package types without their own `toString()`
- Improved `restrict-template-expr` to skip tags such as Drizzle's `sql` that build no string
- Improved `self-import` to catch `export ... from` the file itself
- Improved `deprecated-usage` to report deprecated built-in members that are read, not only called
- Improved `deprecated-usage` to check a deprecated value passed as an argument or used as a receiver
- Fixed `--rules <id>` calling a rule unknown when the config turns it off
- Fixed `type-precision` reporting parameters that are already readonly through an alias or `Readonly<T[]>`
- Fixed the database rules missing `this.db` and `ctx.db` (a query builder from a call, like Supabase `from()`, is none)
- Fixed rules missing a `"use server"` directive that follows `"use strict"`
- Fixed functions exported through `export { a, b as c }` being skipped
- Fixed a project folder named `react/` counting as React
- Fixed `rules-of-hooks` missing library hooks such as zustand's `useStore`
- Fixed `rules-of-hooks` treating React calls without the `use` prefix, such as `createElement`, as hooks
- Fixed loop checks treating a loop's iterable or initializer as repeated code
- Fixed clone detection ignoring control flow, and two empty bodies counting as a 100% match
- Fixed `prefer-nullish-coalescing` and `state-hooks-cluster` missing generic values that can be nullish
- Fixed the run aborting on a read-only `node_modules`
- Fixed `narrow-param-type` suggesting to narrow `ReadonlyMap` and `ReadonlySet` parameters
- Fixed a project file named `lib.*.d.ts` counting as a built-in
- Fixed `no-non-literal-require` reporting a project function that is only named `require`
- Fixed `resolveCallBody` in the SDK missing the body of an overloaded function
- Fixed `isBuiltinCollection` in the SDK rejecting `ReadonlyMap` and `ReadonlySet`
- Fixed `isInConditionalBranch` in the SDK missing `if`/`else` branches and counting a ternary's condition
- Fixed the `function-tags` extractor crashing on an exported arrow function
- Fixed the `complexity-analysis` extractor miscounting an exported arrow function
- Fixed the `function-consumption` extractor missing functions of a multi-declarator `export const`
- Fixed git modes dropping files with quotes, spaces or non-ASCII characters in their names
- Fixed git modes dropping files when the config sits in a subdirectory
- Fixed `--changed` before the first commit and `--commit` on a root commit linting no files
- Fixed autofixes leaving a stray line or an empty `if` or loop body after a removed statement
- Fixed autofixes with several edits landing partly; they now land whole or not at all
- Fixed autofixes landing in the wrong place in a file that starts with a byte order mark
- Fixed `--fix` writing through a symlink that leads out of the project
- Fixed `let` becoming `const` when the variable is written through destructuring or `for...of`
- Fixed `.at()`, `.startsWith()` and `Object.hasOwn()` being suggested where the type or lib lacks them
- Fixed the `.flatMap()` fix dropping its `thisArg`
- Fixed autofixes on a self-import that binds names, a property self-assignment and a `__proto__` key
- Fixed autofixes on a constructor that passes arguments to `super` and on an unreachable declaration
- Fixed rules disagreeing on type-only imports: `import D, { type T }` is a value import everywhere
- Fixed type-only import checks ignoring `verbatimModuleSyntax`
- Fixed `unnecessary-use-server`, `no-client-server-only-import` and `route-boundary` skipping `export ... from`
- Fixed `performance` reporting an `import type` from a barrel
- Fixed `duplicate-import` missing a duplicate when an `import type` sits next to two value imports
- Fixed `deprecated-usage` reporting a deprecated function that calls itself
- Fixed `simplification` reporting a private or protected empty constructor
- Fixed prefer-const in `syntax` counting `!x` or `-x` as a write
- Fixed `no-useless-code` reporting `["__proto__"]` in an object literal or `["constructor"]` in a class
- Fixed `prefer-optional-chain` missing `this.a && this.a.b`
- Fixed `no-implicit-coercion` missing `!!x` inside `&&`/`||` chains and `for` conditions
- Fixed `correctness` missing a parameter written through destructuring or `for...of`
- Fixed `correctness` missing that `{ a = p }` reads `p`
- Fixed `correctness` missing `this.x = this.x` and `x === (x)`
- Fixed `correctness` calling two constants with the same literal value a self-compare
- Fixed `banned-syntax` missing `NaN += 1`, `NaN++`, a destructuring write to a global and `delete (x)`
- Fixed `safety` counting `x === y` or `!x` as a change of a loop condition, and missing destructuring writes
- Fixed `exhaustive-deps`, `react`, `deprecated-usage` and `logic` not reading a shorthand `{ x }` as a read of `x`
- Fixed `logic` comparing conditions without their receiver, so `a.ok` and `b.ok` counted as the same
- Fixed `logic` treating `a[0]` and `a["0"]` as different elements
- Fixed `logic` calling a write dead when the next write reads it, as in `a[0] = v; a[0] = a.reduce(...)`
- Fixed string checks missing string-like types: template literal types, `Uppercase<string>` and literal unions
- Fixed string-like types in `no-base-to-string`, `no-implicit-coercion`, `restrict-plus-operands` and `syntax`
- Fixed string-like types in `typescript`, `no-implied-eval`, `no-collection-size-mischeck` and `restrict-template-expr`
- Fixed `deprecated-usage` reporting a reference when only some declarations of its symbol are deprecated

## 1.5.3

- Added `tsconfig.rules.json` to type-check your own rules against the TypeScript dlint runs them on
- Added the setup: extend `@dfine-io-gmbh/dlint/tsconfig.rules.json`, then run `npx tsc -p .dlint/tsconfig.json`
- Added rule type-checking for projects that build with TypeScript 7 as well
- Added `.dlint/tsconfig.json` to `dlint init`; existing files are left untouched
- Fixed tooling not being able to read the installed version through `@dfine-io-gmbh/dlint/package.json`

## 1.5.2

- Added `dlint --list-rules` to print the active rules as JSON, each with its id and a one-line description
- Added your own rules to `--list-rules`, which needs no tsconfig
- Added skipped rule files to `--format json` under `skippedRules`
- Changed a broken rule file to be skipped and named instead of aborting the run
- Changed rule loading to require a `description` in a rule's `meta`

## 1.5.1

- Changed the N+1 check of `no-db-antipatterns` to `select`, `update` and `delete`
- Fixed your own rules crashing on TypeScript 7 projects; their `typescript` import now uses dlint's TypeScript
- Fixed `no-db-antipatterns` reporting chunked inserts in a loop as N+1
- Fixed `no-await-in-finally` reporting an awaited cleanup when the `try` has a `catch`
- Fixed `no-redundant-zod-parse` reporting `.safeParse()`

## 1.5.0

- Changed dlint to ship its own TypeScript 6.x, so it lints projects on any TypeScript, Go-native TypeScript 7 too
- Changed the requirements: your project no longer needs a JavaScript `typescript` package for dlint

## 1.4.0

- Added `ignorePaths` to `no-duplicate-schema-export`, e.g. `{ ignorePaths: ["worker/"] }` for a mirrored module

## 1.3.0

- Changed the built-in rule count to 86; ship the removed rules as project rules if you need them
- Changed config entries that name a removed rule into no-ops, so existing configs keep working
- Removed the CSS Modules rules `css-class-existence`, `no-css-properties` and `no-static-inline-style`

## 1.2.0

- Added rule groups (`groups`) to set the severity of several rules at once
- Added per-rule options (`ruleOptions`), e.g. `ruleOptions: { "max-file-lines": { maxLines: 500 } }`
- Added an authoring skill under `skills/dfine-lint` for writing, testing and configuring rules
- Added a switch back to the old rule set: `groups: [{ id: "opinionated", severity: "error" }]`
- Changed about 27 style and architecture rules to the `opinionated` group, which is off by default
- Changed a run without config to report real bugs only
- Changed the CLI to print a one-line `dlint: <message>` and exit non-zero instead of printing a stack trace
- Improved upgrades: existing configs keep working, since every new field is optional
