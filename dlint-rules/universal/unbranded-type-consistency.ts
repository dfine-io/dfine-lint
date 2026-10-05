// Flags a plain string that drops a brand: a declaration fed only one brand, Map/Set keys, Record keys.
// brand-erasure reads inflow program-wide and skips every target whose inflow it cannot see.
import ts from "typescript";
import { defineRule, hasDirective, isLibDeclaration, isProjectSourceFile, isWriteTarget, resolveSymbol, valueSymbolOf } from "@dfine-io-gmbh/dlint";

const CONTAINER_KEY_METHODS = new Set(["set", "get", "has", "add", "delete"]);

// Every value a target receives; open = some inflow is invisible to the walk
type Inflow = { readonly values: ts.Expression[]; open: boolean };
const inflowCache = new WeakMap<ts.Program, Map<ts.Node, Inflow>>();

function isPlainString(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.String) return true;
  if (type.isUnion()) {
    return type.types.some(
      (t) => t.flags & ts.TypeFlags.String && !(t.flags & ts.TypeFlags.StringLiteral),
    );
  }
  return false;
}

function isBrandedString(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  return type.types.some((t) => t.flags & ts.TypeFlags.String) &&
    type.types.some((t) => t.flags & ts.TypeFlags.Object);
}

// The written annotation is the string keyword, alone or in a union such as string | null
function isPlainStringAnnotation(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (type.kind === ts.SyntaxKind.StringKeyword) return true;
  return ts.isUnionTypeNode(type) && type.types.some((t) => t.kind === ts.SyntaxKind.StringKeyword);
}

// A named function (declaration, or bound to a variable); an inline callback or a default export has callers it cannot name
function namedFunction(fn: ts.Node): ts.Identifier | undefined {
  if (ts.isFunctionDeclaration(fn)) return ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Default ? undefined : fn.name;
  const bound = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent);
  return bound && ts.isIdentifier(fn.parent.name) ? fn.parent.name : undefined;
}

// A target: an annotated plain-string variable or return type, or such a parameter of a named function outside "use server"
function isTarget(node: ts.Node, rpc: boolean): boolean {
  if (ts.isParameter(node)) return !rpc && !node.dotDotDotToken && isPlainStringAnnotation(node.type) && namedFunction(node.parent) !== undefined;
  return (ts.isVariableDeclaration(node) || ts.isFunctionLike(node)) && isPlainStringAnnotation(node.type);
}

// A function read as a value or re-exposed under another name has callers whose arguments the walk cannot see
function isEscapingReference(id: ts.Identifier, sym: ts.Symbol): boolean {
  const p = id.parent;
  // import { load as l }, export { load as x } and export default load: callers use a name the walk does not match
  if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName !== undefined) return true;
  if (ts.isExportAssignment(p)) return true;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if (sym.declarations?.some((d) => ts.getNameOfDeclaration(d) === id)) return false;
  const ref = ts.isPropertyAccessExpression(p) && p.name === id ? p : id;
  const q = ref.parent;
  if ((ts.isCallExpression(q) || ts.isNewExpression(q)) && q.expression === ref) return false;
  return !ts.isTypeQueryNode(q) && !ts.isTypeOfExpression(q);
}

function collectInflows(program: ts.Program, checker: ts.TypeChecker): Map<ts.Node, Inflow> {
  const cached = inflowCache.get(program);
  if (cached) return cached;
  const inflows = new Map<ts.Node, Inflow>();
  const callees = new Set<string>();
  const targetNames = new Set<string>();
  const files = program.getSourceFiles().filter(isProjectSourceFile);
  // Pass 1, syntax only: targets, the names of their functions, and their own names for the write gate
  for (const sf of files) {
    // A "use server" export is an RPC endpoint: its arguments arrive over the network
    const rpc = hasDirective(sf, "use server");
    const declare = (node: ts.Node): void => {
      if (isTarget(node, rpc)) {
        inflows.set(node, { values: [], open: false });
        const fnName = ts.isParameter(node) ? namedFunction(node.parent) : undefined;
        if (fnName) callees.add(fnName.text);
        const own = ts.isParameter(node) || ts.isVariableDeclaration(node) ? node.name : undefined;
        if (own && ts.isIdentifier(own)) targetNames.add(own.text);
      }
      ts.forEachChild(node, declare);
    };
    declare(sf);
  }
  const feed = (target: ts.Node | undefined, value: ts.Expression): void => {
    if (target) inflows.get(target)?.values.push(value);
  };
  const open = (target: ts.Node | undefined): void => {
    const flow = target && inflows.get(target);
    if (flow) flow.open = true;
  };
  const openParams = (fn: ts.Node, from = 0): void => {
    if (ts.isFunctionLike(fn)) fn.parameters.slice(from).forEach(open);
  };
  // Pass 2: resolve only names pass 1 marked; value types are read at report time, per file
  const visit = (node: ts.Node): void => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) && node.initializer) feed(node, node.initializer);
    if (ts.isReturnStatement(node) && node.expression) feed(ts.findAncestor(node.parent, ts.isFunctionLike), node.expression);
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) feed(node, node.body);
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      const fn = ts.isIdentifier(callee) && callees.has(callee.text) ? checker.getResolvedSignature(node)?.getDeclaration() : undefined;
      if (fn) node.arguments.forEach((arg, i) => (ts.isSpreadElement(arg) ? openParams(fn, i) : feed(fn.parameters[i], arg)));
    }
    // A write always spells the declared name, so the name set is an exact gate
    if (ts.isIdentifier(node) && targetNames.has(node.text) && isWriteTarget(node)) {
      // A plain `=` is read; +=, ++, destructuring and for-of bring values the walk does not see
      const sym = checker.getSymbolAtLocation(node);
      const decl = sym && resolveSymbol(checker, sym).valueDeclaration;
      const write = node.parent;
      if (ts.isBinaryExpression(write) && write.left === node && write.operatorToken.kind === ts.SyntaxKind.EqualsToken) feed(decl, write.right);
      else open(decl);
    }
    if (ts.isIdentifier(node) && callees.has(node.text)) {
      const sym = valueSymbolOf(node, checker);
      if (sym && isEscapingReference(node, sym)) {
        for (const d of resolveSymbol(checker, sym).declarations ?? []) openParams(ts.isVariableDeclaration(d) && d.initializer ? d.initializer : d);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const sf of files) visit(sf);
  inflowCache.set(program, inflows);
  return inflows;
}

function getContainerKeyType(
  receiverType: ts.Type,
  checker: ts.TypeChecker,
): { keyType: ts.Type; name: string } | null {
  const sym = receiverType.getSymbol();
  if (!sym || !isLibDeclaration(sym)) return null;
  if (sym.name !== "Map" && sym.name !== "Set") return null;
  if (!(receiverType.flags & ts.TypeFlags.Object)) return null;
  if (!((receiverType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)) return null;
  const typeArgs = checker.getTypeArguments(receiverType as ts.TypeReference);
  const keyType = typeArgs[0];
  if (!keyType) return null;
  return { keyType, name: sym.name };
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Plain string that only receives one brand (declaration, container key, record key) — use the branded type",
  },
  check(ctx) {
    // The program-wide inflow index runs only for a file that holds a target (--changed lints few files)
    const rpc = hasDirective(ctx.sourceFile, "use server");
    let fileHasTarget = false;
    const scan = (n: ts.Node): void => {
      if (fileHasTarget || isTarget(n, rpc)) fileHasTarget = true;
      else ts.forEachChild(n, scan);
    };
    scan(ctx.sourceFile);
    const inflows = !fileHasTarget || ctx.isSubCheckDisabled("brand-erasure") ? undefined : collectInflows(ctx.program, ctx.checker);
    ctx.walk((node) => {
      // --- Sub-check: brand-erasure — every observed value carries one brand, the annotation says string ---
      const flow = inflows?.get(node);
      const anchor = ts.isFunctionLike(node) ? node.type : ts.isParameter(node) || ts.isVariableDeclaration(node) ? node.name : undefined;
      if (flow && !flow.open && flow.values.length > 0 && anchor) {
        let brand: ts.Type | undefined;
        // Lazily: stop at the first value that is unbranded or carries another brand
        const oneBrand = flow.values.every((v) => {
          const t = ctx.checker.getNonNullableType(ctx.checker.getTypeAtLocation(v));
          if (!isBrandedString(t)) return false;
          brand ??= t;
          return t === brand || (ctx.checker.isTypeAssignableTo(t, brand) && ctx.checker.isTypeAssignableTo(brand, t));
        });
        if (brand && oneBrand) {
          const label = ts.isFunctionLike(node) ? "the return type" : `'${anchor.getText(ctx.sourceFile)}'`;
          ctx.reportAt(anchor, `Type ${label} as ${ctx.checker.typeToString(brand)} -- every value it receives carries that brand, a plain string drops it`, {
            action: "use-branded-type",
            pattern: "Annotate the branded type the values already carry",
            reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
          }, "brand-erasure");
        }
      }

      // --- Sub-check: container-key — Map<string,V>.set(branded) / Set<string>.add(branded) ---
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        CONTAINER_KEY_METHODS.has(node.expression.name.text) &&
        node.arguments.length >= 1 &&
        !ctx.isSubCheckDisabled("container-key")
      ) {
        const receiverType = ctx.checker.getTypeAtLocation(node.expression.expression);
        const container = getContainerKeyType(receiverType, ctx.checker);
        if (!container || !isPlainString(container.keyType)) return;
        const keyArg = node.arguments[0];
        if (!keyArg) return;
        const argType = ctx.checker.getTypeAtLocation(keyArg);
        if (!isBrandedString(argType)) return;
        ctx.reportAt(
          node.expression,
          `Use branded key type in ${container.name}<string, ...>.${node.expression.name.text}() -- receives branded value`,
          { action: "use-branded-key", pattern: "Map<BrandedKey, V> instead of Map<string, V>", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" },
          "container-key",
        );
        return;
      }

      // --- Sub-check: record-key — Record<string,V>[brandedKey] ---
      if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        !ctx.isSubCheckDisabled("record-key")
      ) {
        const keyType = ctx.checker.getTypeAtLocation(node.argumentExpression);
        if (!isBrandedString(keyType)) return;
        const objectType = ctx.checker.getTypeAtLocation(node.expression);
        const indexInfos = ctx.checker.getIndexInfosOfType(objectType);
        if (!indexInfos.some((info) => info.keyType.flags & ts.TypeFlags.String)) return;
        ctx.reportAt(
          node.expression,
          "Use branded key type in Record declaration -- indexed with branded key but declared as string",
          { action: "use-branded-key", pattern: "Record<BrandedKey, V> instead of Record<string, V>", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" },
          "record-key",
        );
      }
    });
  },
});
