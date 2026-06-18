// Flags DB-origin types (Drizzle row types) crossing a client boundary.
// Heuristic-free + deterministic: no path/field-name match, no curated list.
// Intrinsic signal = the Drizzle row API itself: a type alias `typeof <table>.$inferSelect`
// ($inferInsert / InferSelectModel / InferInsertModel). Scales automatically to every new table.
//
// Why an AST graph instead of a type-checker walk: TS discards the row alias on use (the
// $inferSelect property symbols point into Drizzle's node_modules), so the row origin is only
// preserved on the written annotation node. We follow the type-alias declaration graph
// (reference -> alias decl -> member / intersection / type-arg) and report once a node is a
// $inferSelect derivation.
import ts from "typescript";
import { defineRule, hasDirective, getExportedFunctions, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const ROW_QUERY_NAMES = new Set(["$inferSelect", "$inferInsert"]);
const ROW_MODEL_NAMES = new Set(["InferSelectModel", "InferInsertModel"]);
// ===========================================================================

function rightName(name: ts.EntityName): string {
  return ts.isQualifiedName(name) ? name.right.text : name.text;
}

// `typeof table.$inferSelect` (TypeQuery) or `(typeof table)["$inferSelect"]` (IndexedAccess).
function isRowQueryNode(node: ts.TypeNode, rowQueryNames: Set<string>): boolean {
  if (ts.isTypeQueryNode(node)) return rowQueryNames.has(rightName(node.exprName));
  if (ts.isIndexedAccessTypeNode(node) && ts.isTypeQueryNode(node.objectType)) {
    return (
      ts.isLiteralTypeNode(node.indexType) &&
      ts.isStringLiteral(node.indexType.literal) &&
      rowQueryNames.has(node.indexType.literal.text)
    );
  }
  return false;
}

// DFS over the written type-annotation graph. seen = symbol cycle guard.
function nodeReachesRow(node: ts.TypeNode, checker: ts.TypeChecker, seen: Set<ts.Symbol>, rowQueryNames: Set<string>, rowModelNames: Set<string>): boolean {
  if (isRowQueryNode(node, rowQueryNames)) return true;

  if (ts.isParenthesizedTypeNode(node)) return nodeReachesRow(node.type, checker, seen, rowQueryNames, rowModelNames);
  if (ts.isArrayTypeNode(node)) return nodeReachesRow(node.elementType, checker, seen, rowQueryNames, rowModelNames);
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.some((t) => nodeReachesRow(t, checker, seen, rowQueryNames, rowModelNames));
  }
  if (ts.isTypeLiteralNode(node)) {
    return node.members.some((m) => ts.isPropertySignature(m) && m.type !== undefined && nodeReachesRow(m.type, checker, seen, rowQueryNames, rowModelNames));
  }
  if (ts.isTypeReferenceNode(node)) {
    // InferSelectModel<typeof table> / InferInsertModel<...> - Drizzle row API without the $inferSelect suffix.
    if (rowModelNames.has(rightName(node.typeName))) return true;
    // Generic wrappers (Promise / Array / Pick / Omit / Readonly / ...) - search type args without heuristics.
    if (node.typeArguments?.some((a) => nodeReachesRow(a, checker, seen, rowQueryNames, rowModelNames))) return true;
    // Resolve the alias and follow its declaration (reference -> alias body).
    const symbol = checker.getSymbolAtLocation(node.typeName);
    return symbol !== undefined && symbolReachesRow(symbol, checker, seen, rowQueryNames, rowModelNames);
  }
  return false;
}

function symbolReachesRow(symbol: ts.Symbol, checker: ts.TypeChecker, seen: Set<ts.Symbol>, rowQueryNames: Set<string>, rowModelNames: Set<string>): boolean {
  const resolved = resolveSymbol(checker, symbol);
  if (seen.has(resolved)) return false;
  seen.add(resolved);
  return Boolean(
    resolved.declarations?.some((d) => {
      if (ts.isTypeAliasDeclaration(d)) return nodeReachesRow(d.type, checker, seen, rowQueryNames, rowModelNames);
      if (ts.isInterfaceDeclaration(d)) {
        return d.members.some((m) => ts.isPropertySignature(m) && m.type !== undefined && nodeReachesRow(m.type, checker, seen, rowQueryNames, rowModelNames));
      }
      return false;
    }),
  );
}

function returnTypeNode(node: ts.Node): ts.TypeNode | undefined {
  if (ts.isFunctionLike(node)) return node.type;
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionLike(node.initializer)) {
    return node.initializer.type;
  }
  return undefined;
}

export default defineRule({
  meta: { category: "architecture", description: "DB-origin types must not cross a client boundary" },
  check(ctx) {
    const isClient = hasDirective(ctx.sourceFile, "use client");
    const isServer = hasDirective(ctx.sourceFile, "use server");
    if (!isClient && !isServer) return;
    const { checker } = ctx;
    const rowQueryNames = ctx.options.rowQueryNames ? new Set(ctx.options.rowQueryNames as string[]) : ROW_QUERY_NAMES;
    const rowModelNames = ctx.options.rowModelNames ? new Set(ctx.options.rowModelNames as string[]) : ROW_MODEL_NAMES;

    for (const fn of getExportedFunctions(ctx.sourceFile, checker)) {
      if (isClient) {
        const firstParam = fn.parameters[0];
        const paramType = firstParam?.type;
        if (firstParam && paramType && nodeReachesRow(paramType, checker, new Set(), rowQueryNames, rowModelNames)) {
          ctx.reportAt(firstParam, "DB-origin type as Client Component prop — project to a client-safe view", {
            action: "project-client-view",
            pattern: "Replace the Drizzle row type with a hand-declared client-safe view type.",
          });
        }
        continue;
      }
      const retType = returnTypeNode(fn.node);
      if (retType && nodeReachesRow(retType, checker, new Set(), rowQueryNames, rowModelNames)) {
        ctx.reportAt(fn.name, "Server Action returns a DB-origin type — project to a client-safe view", {
          action: "project-client-view",
          pattern: "Return a hand-declared client-safe view, not a Drizzle row type.",
        });
      }
    }
  },
});
