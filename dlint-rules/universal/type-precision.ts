// Enforces 8 sub-checks for type safety and semantic identity principles.
// Checks: Partial to Pick, Record to named keys, index signatures,
// redundant typeof, const to satisfies, in to discriminant, mutable to readonly,
// inline union to named type alias. Precision at the source eliminates downstream guards.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const MUTATING_ARRAY_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
]);
// ===========================================================================

function getLiteralKeys(obj: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) keys.push(prop.name.text);
      else if (ts.isStringLiteral(prop.name)) keys.push(prop.name.text);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.name.text); // ShorthandPropertyAssignment.name: Identifier
    }
  }
  return keys;
}

function isTypeRefNamed(
  typeNode: ts.TypeNode,
  name: string
): typeNode is ts.TypeReferenceNode {
  return (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    typeNode.typeName.text === name
  );
}

/** Boolean form of isTypeRefNamed for negated checks — a type predicate would narrow the operand to never. */
function isTypeRefNamedBool(typeNode: ts.TypeNode, name: string): boolean {
  return isTypeRefNamed(typeNode, name);
}

/** Find a property that is literal-typed on ALL union members (discriminant) */
function findDiscriminantProperty(
  unionType: ts.UnionType,
  checker: ts.TypeChecker
): string | null {
  const candidates = new Map<string, number>();
  for (const member of unionType.types) {
    for (const prop of member.getProperties()) {
      const propType = checker.getTypeOfSymbol(prop);
      if (propType.isStringLiteral() || propType.isNumberLiteral()) {
        candidates.set(prop.name, (candidates.get(prop.name) ?? 0) + 1);
      }
    }
  }
  for (const [name, count] of candidates) {
    if (count === unionType.types.length) return name;
  }
  return null;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Type precision: 9 sub-checks for type safety and semantic identity",
    subChecks: 9,
  },
  check(ctx) {
    const mutatingArrayMethods = ctx.options.mutatingArrayMethods ? new Set(ctx.options.mutatingArrayMethods as string[]) : MUTATING_ARRAY_METHODS;

    if (ctx.sourceFile.fileName.endsWith(".d.ts")) return;
    // Exempt: re-export-only files (UI component wrappers that re-export third-party primitives)
    const sf = ctx.sourceFile;
    if (sf.statements.every(s => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isExportAssignment(s))) return;

    ctx.walk((node) => {
      // Sub-check 1: partial-to-pick — Partial<T> with known-key object literal
      if (
        ts.isVariableDeclaration(node) &&
        node.type &&
        isTypeRefNamed(node.type, "Partial") &&
        node.type.typeArguments?.length === 1 &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        const assignedKeys = getLiteralKeys(node.initializer);
        if (assignedKeys.length > 0) {
          const typeArg = node.type.typeArguments[0]!;
          const innerType = ctx.checker.getTypeAtLocation(typeArg);
          const totalProps = innerType.getProperties().length;
          if (assignedKeys.length < totalProps) {
            const typeArgText = typeArg.getText(ctx.sourceFile);
            const pickKeys = assignedKeys.map((k) => `"${k}"`).join(" | ");
            ctx.reportAt(
              node.type,
              `Replace Partial with Pick<${typeArgText}, ${pickKeys}> -- only ${assignedKeys.length}/${totalProps} keys used`,
              {
                action: "use-pick",
                pattern: `Use Pick<Type, ${pickKeys}> - it states exactly which fields matter`,
                reference: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
                fix: ctx.createFix(node.type, `Pick<${typeArgText}, ${pickKeys}>`),
              }
            );
          }
        }
      }

      // Sub-check 2 (unbranded-type-consistency) moved to specific/unbranded-type-consistency.ts

      // Sub-check 3: record-known-keys — Record<string, V> with literal-key object literal
      if (
        ts.isVariableDeclaration(node) &&
        node.type &&
        isTypeRefNamed(node.type, "Record") &&
        node.type.typeArguments?.length === 2 &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        const keyTypeArg = node.type.typeArguments[0]!;
        const keyType = ctx.checker.getTypeAtLocation(keyTypeArg);
        if (keyType.flags & ts.TypeFlags.String) {
          const literalKeys = getLiteralKeys(node.initializer);
          if (literalKeys.length >= 2) {
            ctx.reportAt(
              node.type,
              `Narrow Record keys to union -- ${literalKeys.length} known literal keys detected`,
              {
                action: "narrow-record-keys",
                pattern: `Record<${literalKeys.map((k) => `"${k}"`).join(" | ")}, V>`,
              }
            );
          }
        }
      }

      // Sub-check 4: index-signature-abuse — [key: string]: T alongside named properties
      if (
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeLiteralNode(node)
      ) {
        let hasIndexSignature = false;
        let namedPropertyCount = 0;
        for (const member of node.members) {
          if (ts.isIndexSignatureDeclaration(member)) hasIndexSignature = true;
          if (ts.isPropertySignature(member)) namedPropertyCount++;
        }
        if (hasIndexSignature && namedPropertyCount > 0) {
          const target = ts.isInterfaceDeclaration(node) ? node.name : node;
          ctx.reportAt(
            target,
            `Remove index signature -- ${namedPropertyCount} named properties provide type safety`,
            {
              action: "remove-index-signature",
              pattern:
                "Remove [key: string]: unknown — use specific properties or Record<K, V>",
            }
          );
        }
      }

      // Sub-check 5: redundant-typeof — typeof guard where TypeChecker already knows the type
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
         node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        ts.isTypeOfExpression(node.left) &&
        ts.isStringLiteral(node.right)
      ) {
        const operand = node.left.expression;
        if (ts.isIdentifier(operand)) {
          const operandType = ctx.checker.getTypeAtLocation(operand);
          if (operandType.isUnion()) return;
          const guardedType = node.right.text;
          const stringType = ctx.checker.getStringType();
          const numberType = ctx.checker.getNumberType();
          const booleanType = ctx.checker.getBooleanType();
          const alreadyNarrow =
            (guardedType === "string" && ctx.checker.isTypeAssignableTo(operandType, stringType)) ||
            (guardedType === "number" && ctx.checker.isTypeAssignableTo(operandType, numberType)) ||
            (guardedType === "boolean" && ctx.checker.isTypeAssignableTo(operandType, booleanType));
          if (alreadyNarrow) {
            ctx.reportAt(
              node,
              `Remove redundant typeof guard -- '${operand.text}' is already typed as ${guardedType}`,
              {
                action: "remove-typeof-guard",
                pattern: "Remove redundant typeof - TypeChecker already knows the type",
              }
            );
          }
        }
      }

      // Sub-check 10: redundant-nullcheck — x !== undefined / x != null on non-nullable type
      if (
        ts.isBinaryExpression(node) &&
        !ctx.isSubCheckDisabled("redundant-nullcheck")
      ) {
        const op = node.operatorToken.kind;
        const isStrictNull =
          (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
          (node.right.kind === ts.SyntaxKind.UndefinedKeyword || node.right.kind === ts.SyntaxKind.NullKeyword);
        const isLooseNull =
          (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) &&
          (node.right.kind === ts.SyntaxKind.NullKeyword || node.right.kind === ts.SyntaxKind.UndefinedKeyword);
        if ((isStrictNull || isLooseNull) && ts.isIdentifier(node.left)) {
          const operandType = ctx.checker.getTypeAtLocation(node.left);
          // Redundant only when null AND undefined are both unassignable to the operand.
          // any/unknown accept null/undefined, so they self-exclude without a flag check.
          const nullAssignable = ctx.checker.isTypeAssignableTo(ctx.checker.getNullType(), operandType);
          const undefinedAssignable = ctx.checker.isTypeAssignableTo(ctx.checker.getUndefinedType(), operandType);
          if (!nullAssignable && !undefinedAssignable) {
            ctx.reportAt(
              node,
              `Remove redundant null check -- '${node.left.text}' is non-nullable`,
              {
                action: "remove-nullcheck",
                pattern: "Type is already non-nullable - remove the guard",
              },
            );
          }
        }
      }

      // Sub-check 6: prefer-satisfies — const x: Type = { ... } where satisfies preserves inference
      if (
        ts.isVariableDeclaration(node) &&
        node.type &&
        ts.isTypeReferenceNode(node.type) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer) &&
        node.initializer.properties.length >= 2 &&
        !isTypeRefNamedBool(node.type, "Partial") &&
        !isTypeRefNamedBool(node.type, "Record")
      ) {
        const parent = node.parent;
        const typeNode = node.type;
        if (ts.isVariableDeclarationList(parent) &&
            parent.flags & ts.NodeFlags.Const) {
          // getTypeFromTypeNode: annotation type (as written) vs inferred type
          const annotatedType = ctx.checker.getTypeFromTypeNode(typeNode);
          const inferredType = ctx.checker.getTypeAtLocation(node.initializer);
          // Skip if inferred type is wider than annotated (satisfies would fail)
          if (!ctx.checker.isTypeAssignableTo(inferredType, annotatedType)) return;
          const typeText = typeNode.getText(ctx.sourceFile);
          ctx.reportAt(
            node.type,
            "Use satisfies instead of type annotation -- preserves tighter inference",
            {
              action: "use-satisfies",
              pattern: "Use satisfies Type instead of : Type - preserves inference",
              reference: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
              fix: [
                { start: node.name.getEnd(), length: typeNode.getEnd() - node.name.getEnd(), newText: "" },
                ctx.insertAfter(node.initializer, " satisfies " + typeText),
              ],
            }
          );
        }
      }

      // Sub-check 7: prefer-discriminated-union — 'prop' in obj where obj has type discriminator
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
        ts.isStringLiteral(node.left)
      ) {
        const objType = ctx.checker.getTypeAtLocation(node.right);
        if (objType.isUnion()) {
          const discriminant = findDiscriminantProperty(objType, ctx.checker);
          if (discriminant) {
            ctx.reportAt(
              node,
              `Use discriminated union check obj.${discriminant} instead of '${node.left.text}' in operator`,
              {
                action: "use-discriminated-union",
                pattern: `Use obj.${discriminant} === 'variant' instead of 'prop' in obj`,
                reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
              }
            );
          }
        }
      }

      // Sub-check 8: prefer-readonly — T[] parameter never mutated in function body
      if (
        ts.isParameter(node) &&
        ts.isIdentifier(node.name)
      ) {
        const paramType = ctx.checker.getTypeAtLocation(node.name);
        if (ctx.checker.isArrayType(paramType)) {
          const typeNode = node.type;
          // AST check: readonly T[] = TypeOperatorNode(ReadonlyKeyword), ReadonlyArray<T> = TypeReference
          const isReadonly = typeNode && (
            (ts.isTypeOperatorNode(typeNode) && typeNode.operator === ts.SyntaxKind.ReadonlyKeyword) ||
            isTypeRefNamed(typeNode, "ReadonlyArray")
          );
          if (typeNode && !isReadonly) {
            const fn = node.parent;
            const body = ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) ||
              ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn)
              ? (ts.isArrowFunction(fn) && !ts.isBlock(fn.body) ? null : (fn.body ?? null))
              : null;
            if (body && ts.isBlock(body)) {
              let mutated = false;
              const paramSymbol = ctx.checker.getSymbolAtLocation(node.name);
              if (!paramSymbol) return;
              function scanMutations(n: ts.Node): void {
                if (mutated) return;
                // arr.push(), arr.sort(), etc. — mutating method call
                if (
                  ts.isPropertyAccessExpression(n) &&
                  ts.isIdentifier(n.expression) &&
                  ctx.checker.getSymbolAtLocation(n.expression) === paramSymbol &&
                  mutatingArrayMethods.has(n.name.text)
                ) {
                  mutated = true;
                  return;
                }
                // arr[i] = x, arr[i] += x, etc. — element assignment (all assignment operators)
                if (
                  ts.isElementAccessExpression(n) &&
                  ts.isIdentifier(n.expression) &&
                  ctx.checker.getSymbolAtLocation(n.expression) === paramSymbol &&
                  ts.isBinaryExpression(n.parent) &&
                  n.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
                  n.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
                  n.parent.left === n
                ) {
                  mutated = true;
                  return;
                }
                ts.forEachChild(n, scanMutations);
              }
              scanMutations(body);
              // Guard: skip fix if param is returned (readonly breaks mutable return type)
              let returned = false;
              function scanReturns(n: ts.Node): void {
                if (returned) return;
                if (ts.isReturnStatement(n) && n.expression && ts.isIdentifier(n.expression) &&
                    ctx.checker.getSymbolAtLocation(n.expression) === paramSymbol) {
                  returned = true;
                  return;
                }
                if (!ts.isArrowFunction(n) && !ts.isFunctionExpression(n) && !ts.isFunctionDeclaration(n))
                  ts.forEachChild(n, scanReturns);
              }
              scanReturns(body);
              if (!mutated) {
                let readonlyFix;
                if (!returned) {
                  if (ts.isArrayTypeNode(typeNode)) {
                    readonlyFix = ctx.insertBefore(typeNode, "readonly ");
                  } else if (isTypeRefNamed(typeNode, "Array")) {
                    readonlyFix = ctx.createFix(typeNode.typeName, "ReadonlyArray");
                  }
                }
                ctx.reportAt(
                  node.name,
                  `Mark '${node.name.text}' as readonly T[] -- never mutated in function body`,
                  {
                    action: "use-readonly-array",
                    pattern: "Use readonly T[] or ReadonlyArray<T> - never mutated",
                    reference: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
                    fix: readonlyFix,
                  }
                );
              }
            }
          }
        }
      }

      // Sub-check 9: no-string-literal-union — inline 2+ string literals in param/return type
      if (ts.isUnionTypeNode(node) && node.types.length >= 2) {
        const literalMembers = node.types.filter(
          (t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)
        );
        if (literalMembers.length >= 2 && literalMembers.length === node.types.length) {
          const inParam = ts.isParameter(node.parent) || ts.isPropertySignature(node.parent);
          const inReturn = ts.isTypeAliasDeclaration(node.parent);
          if (inParam && !inReturn) {
            ctx.reportAt(
              node,
              `Extract inline string union to named type alias -- ${literalMembers.length} literal members`,
              {
                action: "extract-string-union",
                pattern: "type MyType = 'a' | 'b' - then use MyType in params",
              }
            );
          }
        }
      }
    });
  },
});
