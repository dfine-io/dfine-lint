// Detects local constant declarations that duplicate exports from */constants/* directories.
// Cross-file: matches local const name against central export leaf names with same value.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const CONSTANTS_DIR = "/constants/";
// ===========================================================================

interface CentralConstant {
  readonly name: string;
  readonly relativePath: string;
}

const centralConstantsCache = new WeakMap<
  ts.Program,
  ReadonlyMap<string | number, readonly CentralConstant[]>
>();

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function getLiteralValue(node: ts.Expression): string | number | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return undefined;
}

function collectExportValues(
  node: ts.Expression,
  name: string,
  relativePath: string,
  map: Map<string | number, CentralConstant[]>,
): void {
  const unwrapped = unwrapExpression(node);
  const value = getLiteralValue(unwrapped);
  if (value !== undefined) {
    const existing = map.get(value);
    if (existing) existing.push({ name, relativePath });
    else map.set(value, [{ name, relativePath }]);
  }
  if (ts.isObjectLiteralExpression(unwrapped)) {
    for (const prop of unwrapped.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
      collectExportValues(prop.initializer, `${name}.${prop.name.text}`, relativePath, map);
    }
  }
}

function buildCentralMap(
  program: ts.Program,
  checker: ts.TypeChecker,
  constantsDir: string,
): ReadonlyMap<string | number, readonly CentralConstant[]> {
  const projectRoot = program.getCurrentDirectory();
  const map = new Map<string | number, CentralConstant[]>();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
    const relativePath = sf.fileName.slice(projectRoot.length + 1);
    if (!relativePath.includes(constantsDir)) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) continue;
    for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
      const declaration = exportSymbol.valueDeclaration;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) continue;
      collectExportValues(declaration.initializer, exportSymbol.getName(), relativePath, map);
    }
  }
  return map;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Local constants duplicating exports from central */constants/* files",
  },
  check(ctx) {
    const constantsDir = (ctx.options.constantsDir as string) ?? CONSTANTS_DIR;
    let centralMap = centralConstantsCache.get(ctx.program);
    if (!centralMap) {
      centralMap = buildCentralMap(ctx.program, ctx.checker, constantsDir);
      centralConstantsCache.set(ctx.program, centralMap);
    }
    const projectRoot = ctx.program.getCurrentDirectory();
    const relativePath = ctx.sourceFile.fileName.slice(projectRoot.length + 1);
    if (relativePath.includes(constantsDir)) return;

    ctx.walk((node) => {
      if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isIdentifier(node.name)) return;
      const value = getLiteralValue(unwrapExpression(node.initializer));
      if (value === undefined) return;
      const matches = centralMap.get(value);
      if (!matches) return;
      const localName = node.name.text;

      const sameNameMatch = matches.find((match) => {
        const parts = match.name.split(".");
        return parts[parts.length - 1] === localName;
      });
      if (sameNameMatch) {
        ctx.reportAt(
          node,
          `"${localName}" (${JSON.stringify(value)}) duplicates ${sameNameMatch.name} in ${sameNameMatch.relativePath}`,
          { action: "import-central-constant", pattern: `Import ${sameNameMatch.name} from ${sameNameMatch.relativePath}` },
        );
      }
    });
  },
});
