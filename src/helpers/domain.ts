import ts from "typescript";
import type { TypeDeclaration, TypeDeclarationMember } from "../types.js";
import { getExportedFunctions } from "../core/program.js";

// === Collection Primitives ===

/** Collect all type declarations (enums, interfaces, type aliases, constants) from a source file */
export function collectTypeDeclarations(sf: ts.SourceFile, checker: ts.TypeChecker): TypeDeclaration[] {
  const declarations: TypeDeclaration[] = [];
  ts.forEachChild(sf, (node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const isExported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
    if (ts.isEnumDeclaration(node) && node.name) {
      const members: TypeDeclarationMember[] = [];
      for (const member of node.members) {
        if (!ts.isIdentifier(member.name)) continue;
        const value = checker.getConstantValue(member);
        if (value === undefined) continue;
        members.push({ name: member.name.text, type: typeof value === "string" ? "string" : "number", value: String(value) });
      }
      if (members.length > 0) declarations.push({ kind: "enum", name: node.name.text, filePath: sf.fileName, line, isExported, members });
      return;
    }
    if (ts.isTypeAliasDeclaration(node) && node.name) {
      const type = checker.getTypeFromTypeNode(node.type);
      const members: TypeDeclarationMember[] = [];
      if (type.isUnion()) {
        for (const t of type.types) {
          if (t.isStringLiteral()) members.push({ name: t.value, type: "string", value: t.value });
          else if (t.isNumberLiteral()) members.push({ name: String(t.value), type: "number", value: String(t.value) });
        }
      } else {
        // Only collect own properties — filter out inherited ones from node_modules (framework base types etc.)
        for (const prop of type.getProperties()) {
          const decl = prop.declarations?.[0];
          if (!decl) continue;
          if (decl.getSourceFile().fileName.includes("node_modules")) continue;
          members.push({ name: prop.getName(), type: checker.typeToString(checker.getTypeOfSymbol(prop)) });
        }
      }
      if (members.length > 0) declarations.push({ kind: "type-alias", name: node.name.text, filePath: sf.fileName, line, isExported, members });
      return;
    }
    if (ts.isInterfaceDeclaration(node) && node.name) {
      // Use AST members (own declarations only) — getProperties() includes inherited props from extends
      const members: TypeDeclarationMember[] = [];
      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue;
        const sym = checker.getSymbolAtLocation(member.name);
        if (!sym) continue;
        members.push({ name: sym.getName(), type: checker.typeToString(checker.getTypeOfSymbol(sym)) });
      }
      if (members.length > 0) declarations.push({ kind: "interface", name: node.name.text, filePath: sf.fileName, line, isExported, members });
      return;
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.length > 0) {
      const firstDecl = node.declarationList.declarations[0];
      if (
        firstDecl &&
        ts.getCombinedModifierFlags(firstDecl) & ts.ModifierFlags.Export &&
        node.declarationList.flags & ts.NodeFlags.Const
      ) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const value =
            ts.isStringLiteral(decl.initializer) || ts.isNumericLiteral(decl.initializer)
              ? decl.initializer.text
              : undefined;
          if (value === undefined) continue;
          const cLine = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1;
          declarations.push({ kind: "constant", name: decl.name.text, filePath: sf.fileName, line: cLine, isExported: true,
            members: [{ name: decl.name.text, type: ts.isNumericLiteral(decl.initializer) ? "number" : "string", value }] });
        }
      }
    }
  });
  return declarations;
}

/** Collect all exported function signatures from a source file */
export function collectFunctionSignatures(sf: ts.SourceFile, checker: ts.TypeChecker): TypeDeclaration[] {
  const signatures: TypeDeclaration[] = [];
  for (const fn of getExportedFunctions(sf, checker)) {
    const sym = checker.getSymbolAtLocation(fn.name);
    if (!sym) continue;
    const fnType = checker.getTypeOfSymbol(sym);
    const callSigs = fnType.getCallSignatures();
    if (callSigs.length === 0) continue;
    const sig = callSigs[0];
    if (!sig || sig.parameters.length === 0) continue;
    const members: TypeDeclarationMember[] = sig.parameters.map(p => ({
      name: p.getName(), type: checker.typeToString(checker.getTypeOfSymbol(p)),
    }));
    const returnType = checker.typeToString(checker.getReturnTypeOfSignature(sig));
    const line = sf.getLineAndCharacterOfPosition(fn.node.getStart(sf)).line + 1;
    signatures.push({ kind: "function", name: fn.name.text, filePath: sf.fileName, line, isExported: true, members, returnType });
  }
  return signatures;
}

// === Comparison Primitives ===

/** Compute Jaccard similarity between two member lists (normalized name:type pairs) */
export function memberJaccard(a: readonly TypeDeclarationMember[], b: readonly TypeDeclarationMember[]): number {
  const setA = new Set(a.map(m => `${m.name}:${m.type}`));
  const setB = new Set(b.map(m => `${m.name}:${m.type}`));
  let intersection = 0;
  for (const s of setA) { if (setB.has(s)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Generate normalized signature key for index lookup: '(type1,type2)=>returnType' */
export function signatureKey(sig: ts.Signature, checker: ts.TypeChecker): string {
  const paramTypes = sig.parameters.map(p => checker.typeToString(checker.getTypeOfSymbol(p)));
  const returnType = checker.typeToString(checker.getReturnTypeOfSignature(sig));
  return `(${paramTypes.join(",")})=>${returnType}`;
}
