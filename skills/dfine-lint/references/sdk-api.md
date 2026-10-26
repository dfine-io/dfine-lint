# dlint SDK API

## Contents

- Rule shape - `defineRule` and its meta
- Rule context - read-only state and actions
- Advisory and autofix - the third `reportAt` argument
- Helper catalogue - every shared building block, by group
- Result and exported types
- Deterministic patterns - the compiler fact behind each string check

## Rule shape

- Import only from `@dfine-io-gmbh/dlint`, `typescript` and Node built-ins such as `node:path`.
- Export the whole rule as the default export - the engine loads it from source via jiti.

```typescript
export default defineRule({
  meta: {
    category: "security" | "performance" | "quality" | "architecture",
    description: string,           // one line, names what it enforces
    severity?: "error" | "warning",// usually omitted: then override, group, config.severity, "error"
                                   // when set, it outranks every group - only an override turns it off
    subChecks?: number,            // count if the rule bundles several checks
  },
  nodeTypes?: ts.SyntaxKind[],     // optional visit filter; empty/omitted = all nodes
  check(ctx) { /* ... */ },
});
```

## Rule context

| Member | What it is |
| --- | --- |
| `ctx.program: ts.Program` | the full compiled project, built once, shared by every rule |
| `ctx.checker: ts.TypeChecker` | types, symbols, assignability, signatures |
| `ctx.sourceFile: ts.SourceFile` | the current file's AST |
| `ctx.referenceIndex` | cross-file export usage - which export is referenced where |
| `ctx.referencesDir: string` | base dir for advisory reference docs |
| `ctx.projectRoot: string` | `--path`, else the config's dir, else the cwd; `program.getCurrentDirectory()` is always the cwd |
| `ctx.walk(fn)` | visit every node of the current file |
| `ctx.report({ rule, severity, line, column, message, advisory?, subCheck? })` | the raw sink under `reportAt`; the engine replaces `severity` |
| `ctx.reportAt(node, message, advisory?, subCheck?)` | flag at a node; a sub-check id makes its `ruleId:subCheckId` setting decide |
| `ctx.createFix(node, newText)` | replace a node's text |
| `ctx.insertBefore(node, text)` / `ctx.insertAfter(node, text)` | insert around a node |
| `ctx.deleteNode(node)` | remove a node; alone on its lines it takes the lines, a lone `if`/loop body becomes `{}` |
| `ctx.isSubCheckDisabled(id): boolean` | the sub-check is off in this file - skip its work (`config-and-shipping.md` "Severity precedence") |
| `ctx.options: Record<string, unknown>` | the project's values for this rule's tunables |

- Prefer `reportAt` over `report` - it derives `line` and `column` from the node.
- Read every option as `ctx.options.key ?? DEFAULT` - an unset option then behaves as before.

## Advisory and autofix

```typescript
{
  action: string,        // short kebab id of the suggested fix, e.g. "add-await"
  pattern: string,       // how to fix it, human-readable
  reference?: string,    // doc URL or path; a value without "/" resolves to referencesDir/<value>
  fix?: TextChange | TextChange[],  // optional deterministic autofix
}
```

- Expect `TextChange = { start: number; length: number; newText: string }`.
- Build every TextChange with `createFix`, `insertBefore`, `insertAfter` or `deleteNode`.
- Add a `fix` only when it keeps the behaviour for every value the types allow - else `pattern`.
- Expect a multi-change fix to land whole or not at all - an overlapping fix is skipped.
- Expect the fixer to apply bottom to top, and the CLI to lint again after `--fix`.

## Helper catalogue

- Put every piece of shared logic into these SDK helpers - never copy it between rules.

### Authoring

| Helper | Does |
| --- | --- |
| `defineRule(opts)` | create a rule |
| `defineExtractor({ id, name, extract, dashboard? })` | create an `--extract` data extractor; `extract(ctx)` returns an array per file, `ctx` holds `program`, `checker`, `sourceFile`, the config's `tags` and `directive`; loads from `extractorsDir` |

### File, directive and export

| Helper | Does |
| --- | --- |
| `hasDirective(sourceFile, "use server" \| "use client" \| ...)` | the file-level directive is present |
| `getExportedFunctions(sourceFile, checker)` | `ExportedFunction[]` - every exported function declaration and `const x = () => ...` or function-expression initializer, `export { a as b }` included, no anonymous default; `name` is the local identifier, `func` the function node |
| `buildReferenceIndex(program, checker)` | cross-file export usage - use `ctx.referenceIndex` instead |

### Symbol and type

| Helper | Does |
| --- | --- |
| `resolveCallee(call, checker)` | `ResolvedCallee \| undefined` - what a call, `new` or tagged template invokes, through aliases and member access, cached per node: `symbol`, declared `name` (a default export reads its declaration's name), `lib`, `packageName` (also via `declare module`), `moduleName` (an ambient module such as `"fs"`, `node:` dropped), `global` (a top-level global of the lib or a package; members and project code are not) |
| `resolveSymbol(checker, symbol)` | follow aliases to the original declaration |
| `isFromPackage(identifier, checker, "react")` | the symbol resolves into that npm package or its ambient module - a project folder `react/` does not |
| `isLibDeclaration(symbol)` | a declaration sits in TypeScript's own `lib.*.d.ts` (e.g. global `RegExp`, `Error`) - a project file of that name does not |
| `isTypeFromPackage(type, checker, "zod")` | the type, its alias, a union or intersection member or a base class comes from that package |
| `extendsLibType(type, checker, ["Error"])` | the type is or derives from one of those lib types (`class E<T> extends TypeError`) |
| `classOrInterfaceOf(type)` | the class or interface a type instantiates (`Box<string>` reads `Box`), for `checker.getBaseTypes` |
| `isProjectSourceFile(sourceFile)` | no `.d.ts` and not in an installed package - a symlinked workspace package counts |
| `isNodeModulesDeclaration(symbol)` | declared in `node_modules` |
| `isNullableType(type)` | includes `null` or `undefined`; a type parameter answers through its constraint |
| `hasOwnToString(type, checker)` | has its own `toString()`, not `[object Object]` - arrays, tuples, `Error`, `Date`, `RegExp` count |
| `isStringType(type)` | a string, string or template literal, `Uppercase<T>`-style mapping, or a union of these |
| `isAssignableTo(checker, source, target)` | structural compatibility |
| `unwrapPromiseType(type, checker)` | `T` from `Promise<T>` |
| `isBuiltinCollection(type, checker)` | a lib `Array`, `Map`, `Set`, `WeakMap`, `WeakSet` or `Promise`, readonly forms included |
| `hasJsDocTag(symbol, ...tagNames)` | one of the JSDoc tags is present, e.g. `"deprecated"` |
| `isThenable(type, checker)` | has a callable `then`, or a union or intersection member does |
| `isSameReference(a, b, checker)` | two identifiers (by `valueSymbolOf`), property chains, same-key element accesses or `this` that name the same thing; parentheses are skipped |

### AST position

| Helper | Does |
| --- | --- |
| `isInsideLoop(node)` | runs per iteration - body, condition or update, not a once-run header such as the `for...of` iterable; stops at functions |
| `isInConditionalBranch(node)` | inside an `if`/`else` or ternary branch, not the condition; stops at functions |
| `isInBooleanContext(node)` | in a boolean position |
| `isWriteTarget(expression)` | assigned (destructuring and `for...in`/`of` heads too), incremented, decremented or deleted |
| `valueSymbolOf(identifier, checker)` | the variable an identifier names; in a shorthand `{ a }` the variable, not the property; in `{ a = b }` the default `b` names itself |

### Detection

| Helper | Does |
| --- | --- |
| `isDbCall(node, checker, methods, packageName?)` | ORM/DB call on a stored handle (`db`, `this.db`, `ctx.db`), e.g. Drizzle `select/insert/update/delete`; a builder returned by a call is no handle; with `packageName` the handle's type must come from that package |
| `dbRootMethod(node, checker, methods, packageName?)` | the method called on that handle (`"select"`, `"insert"`, ...), or `null` |
| `returnTypeHasProperties(...)` | the return type carries specific fields |

### Cross-file

| Helper | Does |
| --- | --- |
| `resolveCallBody(...)` | resolve a function body across file boundaries |
| `bodyContainsCall(...)` | a body calls a name by spelling - goes in 2.0, walk with `resolveCallee` instead |
| `resolveImportedModule(program, specifier)` | resolve a specifier literal the way the program does (resolution mode included), cached per program - use it over `ts.resolveModuleName` |
| `collectValueImports(program, sourceFile)` | the specifier literals a file loads at runtime under the program's options: value imports, value re-exports, `import("x")`; `literal.parent` is the declaration or call |
| `isTypeOnlyImport(declaration, compilerOptions)` | an import or re-export that loads nothing at runtime; under `verbatimModuleSyntax` only `import type` / `export type` count |

### Clone and type shape

| Helper | Does |
| --- | --- |
| `tokenizeFile(sourceFile)` | normalized token blocks of every function body with 5+ statements, cached, read-only |
| `tokenSimilarity(a, b)` | bigram set Jaccard - repeats saturate it; goes in 2.0, use `tokenBagSimilarity` |
| `tokenBagSimilarity(a, b)` | bigram Jaccard over multisets - a repeat counts each time |
| `collectTypeDeclarations`, `collectFunctionSignatures`, `memberJaccard`, `signatureKey` | type discovery and signature fingerprints |

## Result and exported types

- Expect `LintResult` to hold `diagnostics`, `fileCount`, `ruleCount`, `errorCount`.
- Expect its `checkCount` to count sub-checks too.
- Expect it to hold `warningCount`, `fixableCount`, `durationMs`, `skippedRules?`, `timings?` too.
- Read `timings` (`LintTimings`) for the phase and per-rule milliseconds of a `--benchmark` run.
- Expect `skippedRules` to name each rule file that failed to load, with the reason.
- Import the config, rule, result and extractor types from the package - `src/index.ts` lists them.
- Expect `DlintConfig`, `RuleMeta`, `DefineRuleOptions`, `LintResult`, `ExtractorContext` there.
- Expect `ResolvedCallee`, `ExportedFunction` and `TokenizedBlock` there too.
- Expect `RuleContext`, `EnhancedRuleContext`, `Advisory`, `Diagnostic` to stay unexported.
- Expect `RuleGroup` and `SkippedRule` to stay unexported as well.

## Deterministic patterns

- Replace each string check with the compiler fact it guesses at.

| String check | Compiler fact |
| --- | --- |
| `callee.text === "useEffect"` | `resolveCallee(call, checker)` -> `name` + `packageName` |
| `fetch`, `setTimeout` or another global name | `resolveCallee(...)` -> `global` or `lib` |
| module path regex such as `/^(node:)?fs$/` | `resolveCallee(...)` -> `moduleName === "fs"` |
| receiver has `parse` and `safeParse` | `isTypeFromPackage(type, checker, "zod")` |
| class name ends in `Error` | `extendsLibType(type, checker, ["Error"])` |
| `new RegExp` by identifier | `extendsLibType(calleeType, checker, ["RegExpConstructor"])` |
| `typeName.text === "Partial"` | `checker.getSymbolAtLocation(typeName)` + `isLibDeclaration` |
| `typeName.text === "const"` | `ts.isConstTypeReference(typeNode)` |
| `fileName.endsWith(".tsx")` | `sourceFile.languageVariant === ts.LanguageVariant.JSX` |
| `fileName.endsWith(".d.ts")` | `sourceFile.isDeclarationFile` |
| `fileName.includes("node_modules")` | `isProjectSourceFile(sourceFile)` |
| `fileName.slice(cwd.length + 1)` | `relative(ctx.projectRoot, fileName)` |

- Accept a missed value alias such as `const f = fetch; f(url)` - `resolveCallee` sees a local.
- Know why: a guessed alias costs false positives.
- Identify an API by its origin, never its name - see the first pair below.
- Decide on types, never on spellings - see the second pair.
- Make each project knob an option, never a path or name special case - see the third pair.

```typescript
// Avoid - any local `cache` matches
if (node.expression.text === "cache") { /* ... */ }
// Prefer - aliases, React.cache and namespace imports included
const callee = resolveCallee(node, ctx.checker);
if (callee?.packageName === "react" && callee.name === "cache") { /* ... */ }

// Avoid - nullability guessed from a name
if (/maybe|opt/i.test(name)) { /* ... */ }
// Prefer - ask the checker
if (isNullableType(ctx.checker.getTypeAtLocation(node))) { /* ... */ }

// Avoid - a project's folder special-cased in the rule
if (filePath.includes("/legacy/")) return;
// Prefer - a CONFIG default the project overrides via ruleOptions
const ignored = (ctx.options.ignoredDirs as string[]) ?? IGNORED_DIRS;
```
