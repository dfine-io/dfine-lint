// Flags DB-origin types (Drizzle row types) crossing a client boundary.
// Signal = the Drizzle row API, verified by package identity: `typeof <table>.$inferSelect`
// ($inferInsert alike) on a drizzle-orm table, or drizzle-orm's InferSelectModel / InferInsertModel.
//
// Why an AST graph instead of a type-checker walk: TS discards the row alias on use (the
// $inferSelect property symbols point into Drizzle's node_modules), so the row origin is only
// preserved on the written annotation node. We follow the type-alias declaration graph
// (reference -> alias decl -> member / intersection / type-arg) and report once a node is a
// $inferSelect derivation.
import ts from "typescript";
import { defineRule, hasDirective, getExportedFunctions, isFromPackage, isTypeFromPackage, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const ROW_QUERY_NAMES = new Set(["$inferSelect", "$inferInsert"]);
const ROW_MODEL_NAMES = new Set(["InferSelectModel", "InferInsertModel"]);
// ===========================================================================

function rightIdentifier(name: ts.EntityName): ts.Identifier {
  return ts.isQualifiedName(name) ? name.right : name;
}

// `typeof table.$inferSelect` (TypeQuery) or `(typeof table)["$inferSelect"]` (IndexedAccess) on a drizzle-orm table;
// the TypeQuery names a member symbol (isFromPackage), the indexed form only a string, so its table type decides
function isRowQueryNode(node: ts.TypeNode, checker: ts.TypeChecker, rowQueryNames: Set<string>): boolean {
  if (ts.isTypeQueryNode(node)) {
    const right = rightIdentifier(node.exprName);
    return rowQueryNames.has(right.text) && isFromPackage(right, checker, "drizzle-orm");
  }
  if (ts.isIndexedAccessTypeNode(node) && ts.isTypeQueryNode(node.objectType)) {
    return (
      ts.isLiteralTypeNode(node.indexType) &&
      ts.isStringLiteral(node.indexType.literal) &&
      rowQueryNames.has(node.indexType.literal.text) &&
      isTypeFromPackage(checker.getTypeFromTypeNode(node.objectType), checker, "drizzle-orm")
    );
  }
  return false;
}

// DFS over the written type-annotation graph. seen = symbol cycle guard.
function nodeReachesRow(node: ts.TypeNode, checker: ts.TypeChecker, seen: Set<ts.Symbol>, rowQueryNames: Set<string>, rowModelNames: Set<string>): boolean {
  if (isRowQueryNode(node, checker, rowQueryNames)) return true;

  if (ts.isParenthesizedTypeNode(node)) return nodeReachesRow(node.type, checker, seen, rowQueryNames, rowModelNames);
  if (ts.isArrayTypeNode(node)) return nodeReachesRow(node.elementType, checker, seen, rowQueryNames, rowModelNames);
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.some((t) => nodeReachesRow(t, checker, seen, rowQueryNames, rowModelNames));
  }
  if (ts.isTypeLiteralNode(node)) {
    return node.members.some((m) => ts.isPropertySignature(m) && m.type !== undefined && nodeReachesRow(m.type, checker, seen, rowQueryNames, rowModelNames));
  }
  if (ts.isTypeReferenceNode(node)) {
    const symbol = checker.getSymbolAtLocation(node.typeName);
    // InferSelectModel<typeof table> / InferInsertModel<...> from drizzle-orm, under any import alias
    if (symbol && rowModelNames.has(resolveSymbol(checker, symbol).name) && isFromPackage(rightIdentifier(node.typeName), checker, "drizzle-orm")) return true;
    // Generic wrappers (Promise / Array / Pick / Omit / Readonly / ...) - search type args without heuristics.
    if (node.typeArguments?.some((a) => nodeReachesRow(a, checker, seen, rowQueryNames, rowModelNames))) return true;
    // Resolve the alias and follow its declaration (reference -> alias body).
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
      const retType = fn.func.type;
      if (retType && nodeReachesRow(retType, checker, new Set(), rowQueryNames, rowModelNames)) {
        ctx.reportAt(fn.name, "Server Action returns a DB-origin type — project to a client-safe view", {
          action: "project-client-view",
          pattern: "Return a hand-declared client-safe view, not a Drizzle row type.",
        });
      }
    }
  },
});
