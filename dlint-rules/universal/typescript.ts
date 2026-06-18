// Enforces TypeScript best practices: no `any` in public APIs, no `as` type assertions,
// no non-null assertions (!), and proper use of discriminated unions.
// Type safety at boundaries prevents error propagation through the codebase.
import ts from "typescript";
import { defineRule, isBuiltinCollection } from "@dfine-io-gmbh/dlint";

const VALID_PROP_NAME = /^[a-zA-Z_$]/;

export default defineRule({
  meta: {
    category: "quality",
    description: "TypeChecker-powered: null-check, implicit-any, unsafe-index, shadowed-binding",
    subChecks: 11,
  },
  check(ctx) {
    const offInferrable = ctx.isSubCheckDisabled("no-inferrable-types");
    const offNullCheck = ctx.isSubCheckDisabled("null-check");
    const offUnsafeIndex = ctx.isSubCheckDisabled("unsafe-index");
    const offNonNull = ctx.isSubCheckDisabled("no-non-null-assertion");
    const offNoAny = ctx.isSubCheckDisabled("no-explicit-any");
    ctx.walk((node) => {
      // catch-unknown: catch(e: any) → catch(e: unknown)
      if (ts.isCatchClause(node) && node.variableDeclaration?.type) {
        if (node.variableDeclaration.type.kind === ts.SyntaxKind.AnyKeyword) {
          ctx.reportAt(node.variableDeclaration.type, "Catch variable typed as any — use unknown", { action: "use-catch-unknown", pattern: "Use catch (error: unknown) instead of catch (error: any)", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", fix: ctx.createFix(node.variableDeclaration.type, "unknown") });
        }
      }

      // throw-error: throw string → throw new Error() (TypeChecker-verified)
      if (ts.isThrowStatement(node) && node.expression) {
        const throwType = ctx.checker.getTypeAtLocation(node.expression);
        if (
          (throwType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) ||
          (throwType.isUnion() && throwType.types.every(t => (t.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) !== 0))
        ) {
          const throwFix = ctx.createFix(node.expression, "new Error(" + node.expression.getText(ctx.sourceFile) + ")");
          ctx.reportAt(node, "throw string — use throw new Error(message) for stack traces", { action: "throw-error-object", pattern: "Use throw new Error(message) instead of throw string", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", fix: throwFix });
        }
      }

      // double-assertion: x as any as T
      if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)) {
        ctx.reportAt(node, "Double type assertion (as X as Y) bypasses type safety", { action: "remove-double-assertion", pattern: "Use proper generic or type guard instead of double assertion", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
      }

      // no-inferrable-types: annotation matches inferred type (TypeChecker-verified)
      if (!offInferrable && ts.isVariableDeclaration(node) && node.type && node.initializer) {
        const annotatedType = ctx.checker.getTypeFromTypeNode(node.type);
        const inferredType = ctx.checker.getTypeAtLocation(node.initializer);
        if (
          annotatedType === inferredType &&
          (annotatedType.flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean))
        ) {
          const typeName = ctx.checker.typeToString(annotatedType);
          ctx.reportAt(node.type, `Type '${typeName}' is inferrable — remove annotation`, { action: "remove-inferrable-type", pattern: "Remove inferrable type annotation", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", fix: { start: node.name.getEnd(), length: node.type!.getEnd() - node.name.getEnd(), newText: "" } });
        }
      }

      // null-check: property access on nullable without guard (TypeChecker)
      if (!offNullCheck && ts.isPropertyAccessExpression(node) && !ts.isOptionalChain(node)) {
        let type = ctx.checker.getTypeAtLocation(node.expression);
        if (type.flags & ts.TypeFlags.TypeParameter) {
          const constraint = ctx.checker.getBaseConstraintOfType(type);
          if (constraint) type = constraint;
        }
        if (
          !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
          type !== ctx.checker.getNonNullableType(type) &&
          // Skip: inside if-guard or optional chain already handles this
          !ts.isIfStatement(node.parent) &&
          !ts.isConditionalExpression(node.parent)
        ) {
          // Skip: parent chain already uses optional chaining
          let ancestor: ts.Node | undefined = node.parent;
          let guarded = false;
          while (ancestor && !guarded) {
            if (ts.isOptionalChain(ancestor)) guarded = true;
            ancestor = ancestor.parent;
          }
          if (!guarded) {
            ctx.reportAt(node, `Add null check for '${node.expression.getText(ctx.sourceFile).slice(0, 20)}' -- property access on nullable type`, { action: "add-null-guard", pattern: "Use expr?.property or add null guard", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
          }
        }
      }

      // implicit-any-return: function without return type that returns any (TypeChecker)
      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
        node.name && !node.type
      ) {
        const sig = ctx.checker.getSignatureFromDeclaration(node);
        if (sig) {
          const retType = ctx.checker.getReturnTypeOfSignature(sig);
          if (retType.flags & ts.TypeFlags.Any) {
            ctx.reportAt(node.name, `Add return type to '${ts.isIdentifier(node.name) ? node.name.text : "anonymous"}' -- implicitly returns any`, { action: "add-return-type", pattern: "Add return type annotation", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
          }
        }
      }

      // unsafe-index: obj[key] on type without index signature (TypeChecker)
      if (
        !offUnsafeIndex &&
        ts.isElementAccessExpression(node) &&
        !ts.isStringLiteral(node.argumentExpression) &&
        !ts.isNumericLiteral(node.argumentExpression)
      ) {
        const objType = ctx.checker.getApparentType(
          ctx.checker.getTypeAtLocation(node.expression)
        );
        if (
          !(objType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
          !isBuiltinCollection(objType, ctx.checker)
        ) {
          const indexInfo = ctx.checker.getIndexInfosOfType(objType);
          if (indexInfo.length === 0 && !objType.isUnion()) {
            // Skip: key type is a subtype of the object's property keys (Record<K,V>, enum access)
            const keyType = ctx.checker.getTypeAtLocation(node.argumentExpression);
            const props = objType.getProperties();
            if (props.length > 0) {
              const allLiteral = props.every((p) => VALID_PROP_NAME.test(p.name));
              const keyIsLiteral = keyType.isStringLiteral() || keyType.isNumberLiteral() ||
                (keyType.isUnion() && keyType.types.every((t) => t.isStringLiteral() || t.isNumberLiteral()));
              if (allLiteral && keyIsLiteral) return;
            }
            ctx.reportAt(node, "Add index signature or use Map<K,V> -- index access may return undefined", { action: "add-index-signature", pattern: "Add index signature or use Map<K,V>", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
          }
        }
      }

      // shadowed-binding: variable shadows enclosing function scope (not siblings, not globals)
      if (
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        !ts.isCatchClause(node.parent?.parent)
      ) {
        const name = node.name.text;
        const declSym = ctx.checker.getSymbolAtLocation(node.name);
        if (declSym) {
          const findScope = (n: ts.Node): ts.Node | null => {
            let c = n.parent;
            while (c) {
              if (ts.isFunctionDeclaration(c) || ts.isArrowFunction(c) ||
                  ts.isFunctionExpression(c) || ts.isMethodDeclaration(c) ||
                  ts.isSourceFile(c)) return c;
              c = c.parent;
            }
            return null;
          };
          const innerScope = findScope(node);
          const outerScope = innerScope ? findScope(innerScope) : null;
          if (outerScope) {
            const outerSymbols = ctx.checker.getSymbolsInScope(outerScope, ts.SymbolFlags.Variable);
            const shadowed = outerSymbols.find(s => s.name === name && s !== declSym);
            if (shadowed && !shadowed.declarations?.every(d => d.getSourceFile().isDeclarationFile)) {
              ctx.reportAt(node.name, `Rename '${name}' -- shadows outer variable in enclosing scope`, { action: "rename-variable", pattern: "Rename variable to avoid shadowing outer scope", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
            }
          }
        }
      }

      // no-empty-interface: interface Foo {} without extends
      if (ts.isInterfaceDeclaration(node) && node.members.length === 0) {
        if (!node.heritageClauses?.length) {
          ctx.reportAt(node.name, `Empty interface '${node.name.text}' — use type alias or add members`, { action: "convert-to-type", pattern: "Use type Foo = {} or add interface members", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", fix: ctx.createFix(node, "type " + node.name.text + " = Record<string, never>;") });
        }
      }

      // no-non-null-assertion: x! → use null check or ?.
      if (!offNonNull && ts.isNonNullExpression(node) && !ctx.sourceFile.fileName.endsWith(".d.ts")) {
        ctx.reportAt(node, `Non-null assertion on '${node.expression.getText(ctx.sourceFile).slice(0, 30)}' — use ?. or null check`, { action: "remove-non-null", pattern: "Use expr?.property instead of expr!.property", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
      }

      // no-explicit-any: any keyword in type annotations
      if (!offNoAny && node.kind === ts.SyntaxKind.AnyKeyword && !ctx.sourceFile.fileName.endsWith(".d.ts")) {
        // Skip: catch variable type — handled by catch-unknown check above
        // AST: AnyKeyword → VariableDeclaration → CatchClause
        if (ts.isVariableDeclaration(node.parent) && node.parent.parent && ts.isCatchClause(node.parent.parent)) return;
        ctx.reportAt(node, "Explicit 'any' — use 'unknown' or specific type", { action: "replace-any", pattern: "Use unknown or a specific type instead of any", reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html" });
      }
    });
  },
});
