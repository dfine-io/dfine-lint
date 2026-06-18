# dlint SDK API

Everything a rule can use. All imports come from `@dfine-io-gmbh/dlint` and `typescript`
only - a rule never imports from another rule.

## Table of contents

- defineRule + rule shape
- The rule context (ctx)
- Advisory + autofix (TextChange)
- Helper catalogue (the only place shared logic lives)
- Deterministic patterns (symbol/type, not strings)

## defineRule + rule shape

```typescript
export default defineRule({
  meta: {
    category: "security" | "performance" | "quality" | "architecture",
    description: string,           // one line, names what it enforces
    severity?: "error" | "warning",// in-rule default; usually omitted (engine default = error)
    subChecks?: number,            // count if the rule bundles several checks
  },
  nodeTypes?: ts.SyntaxKind[],     // optional visit filter; empty/omitted = all nodes
  check(ctx) { /* ... */ },
});
```

- The rule **id is the filename** (`no-floating-promises.ts` -> id `no-floating-promises`).
  Make it descriptive: it names the bug it finds.
- The whole rule is the default export; the engine loads it via jiti from source.

## The rule context (ctx)

Read-only compiler state:

- `ctx.program: ts.Program` - the full compiled project (shared across all rules, built once).
- `ctx.checker: ts.TypeChecker` - resolve types, symbols, assignability, signatures.
- `ctx.sourceFile: ts.SourceFile` - the current file's AST.
- `ctx.referenceIndex` - cross-file export-usage map (which exports are referenced where).
- `ctx.referencesDir: string` - base dir for advisory reference docs.

Actions:

- `ctx.walk((node: ts.Node) => void)` - visit every node in the current file.
- `ctx.reportAt(node, message, advisory?)` - flag a problem at a node.
- `ctx.createFix(node, newText)` - replace a node's text.
- `ctx.insertBefore(node, text)` / `ctx.insertAfter(node, text)` - insert around a node.
- `ctx.deleteNode(node)` - remove a node.
- `ctx.isSubCheckDisabled(subCheckId: string): boolean` - gate a sub-check (see config ref).
- `ctx.options: Record<string, unknown>` - project overrides for this rule's tunable values.
  Always read as `ctx.options.key ?? DEFAULT` so behavior is identical when unset.

## Advisory + autofix

`reportAt`'s third argument:

```typescript
{
  action: string,        // short kebab id of the suggested fix, e.g. "add-await"
  pattern: string,       // how to fix it, human-readable
  reference?: string,    // optional doc URL
  fix?: TextChange | TextChange[],  // optional deterministic autofix
}
```

`TextChange = { start: number; length: number; newText: string }`. Build them with
`ctx.createFix / insertBefore / insertAfter / deleteNode`. A fix must be safe and minimal;
the fixer applies changes bottom-to-top with an overlap guard. Only add a `fix` when the
correction is unambiguous.

## Helper catalogue

These are the ONLY shared building blocks - put cross-cutting logic here (in the SDK), never
copy it between rules.

Rule/extractor authoring:

- `defineRule(opts)` - create a rule.
- `defineExtractor(opts)` - create a cross-rule data extractor.

File / directive / export:

- `hasDirective(sourceFile, "use server" | "use client" | ...)` - file-level directive present?
- `getExportedFunctions(sourceFile, checker)` -> `ExportedFunction[]` - all export forms.
- `buildReferenceIndex(program, checker)` - cross-file export usage; prefer `ctx.referenceIndex`.

Symbol / type (the anti-heuristic core):

- `resolveSymbol(checker, symbol)` - follow aliases to the original declaration.
- `isFromPackage(identifier, checker, "react")` - symbol resolves into that npm package.
- `isLibDeclaration(symbol)` - from `lib.*.d.ts` / a built-in (e.g. global `RegExp`, `Error`).
- `isNodeModulesDeclaration(symbol)` - declared in `node_modules`.
- `isNullableType(type)` - includes `null`/`undefined`?
- `hasOwnToString(type)` - has its own `toString()` (not `[object Object]`)?
- `isAssignableTo(checker, source, target)` - structural compatibility.
- `unwrapPromiseType(type, checker)` - `T` from `Promise<T>`.
- `isBuiltinCollection(type, checker)` - `Map` / `Set` / `Array`.
- `hasJsDocTag(declaration, "deprecated")` - JSDoc tag present.

AST position:

- `isInsideLoop(node)` - parent-chain check, stops at function boundary.
- `isInConditionalBranch(node)` - inside an `if`/ternary branch.
- `isInBooleanContext(node)` - in a boolean position.

Detection:

- `isDbCall(node, checker, methods)` - ORM/DB call (e.g. Drizzle `select/insert/update/delete`).
- `returnTypeHasProperties(...)` - return type carries specific fields.

Cross-file:

- `resolveCallBody(...)` - resolve a function body across file boundaries.
- `bodyContainsCall(...)` - does a body call a specific function?

Clone / similarity:

- `tokenizeFile(sourceFile)` -> `TokenizedBlock[]` - normalized token blocks.
- `tokenSimilarity(a, b)` - bigram Jaccard between token sequences.

Domain / type shape:

- `collectTypeDeclarations(...)`, `collectFunctionSignatures(...)`, `memberJaccard(...)`,
  `signatureKey(...)` - interface/type discovery and signature fingerprints.

If a helper you need does not exist, add it to the SDK (`src/helpers/...`) and export it from
`src/index.ts` - do not inline a one-off heuristic in the rule.

## Deterministic patterns (symbol/type, not strings)

The difference between a shippable rule and a flaky one is almost always here.

**Identify an API by its origin, not its name.**

```typescript
// Avoid - name heuristic: any local `cache`/`fetch`/`Error` matches; breaks across codebases.
if (node.expression.text === "cache") {
  /* ... */
}

// Prefer - resolve the symbol to its package/lib.
if (
  ts.isIdentifier(node.expression) &&
  node.expression.text === "cache" &&
  isFromPackage(node.expression, ctx.checker, "react")
) {
  /* ... */
}
```

**Decide on types, not on spellings.**

```typescript
// Avoid - guessing nullability from a name.
if (/maybe|opt/i.test(name)) {
  /* ... */
}

// Prefer - ask the checker.
const t = ctx.checker.getTypeAtLocation(node);
if (isNullableType(t)) {
  /* ... */
}
```

**Make tunable knobs options, never path/name special-cases.**

```typescript
// Avoid - special-casing a project's folders inside the rule.
if (filePath.includes("/legacy/")) return;

// Prefer - a CONFIG default the project can override via ruleOptions.
const ignored = (ctx.options.ignoredDirs as string[]) ?? IGNORED_DIRS;
```

**A finding is a codebase bug (G1.1).** When a rule fires on real code, the default is to fix
the code, not the rule. Loosen the rule only for a _true_ false positive, and only with a
generic, type/symbol-based condition - never a per-file or per-name patch.
