// Detects local constant declarations that duplicate exports from */constants/* directories.
// Cross-file: matches local const name against central export leaf names with same value.
import ts from "typescript";
import { relative, sep } from "node:path";
import { defineRule, isProjectSourceFile } from "@dfine-io-gmbh/dlint";

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

// Project-relative path with forward slashes, the form messages show
function projectPath(projectRoot: string, fileName: string): string {
  return relative(projectRoot, fileName).split(sep).join("/");
}

function buildCentralMap(
  program: ts.Program,
  checker: ts.TypeChecker,
  constantsDir: string,
  projectRoot: string,
): ReadonlyMap<string | number, readonly CentralConstant[]> {
  const map = new Map<string | number, CentralConstant[]>();
  for (const sf of program.getSourceFiles()) {
    if (!isProjectSourceFile(sf)) continue;
    const relativePath = projectPath(projectRoot, sf.fileName);
    // The leading slash lets a constants/ directory at the project root match like a nested one
    if (!("/" + relativePath).includes(constantsDir)) continue;
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
    const option = ctx.options.constantsDir;
    const constantsDir = typeof option === "string" ? option : CONSTANTS_DIR;
    let centralMap = centralConstantsCache.get(ctx.program);
    if (!centralMap) {
      centralMap = buildCentralMap(ctx.program, ctx.checker, constantsDir, ctx.projectRoot);
      centralConstantsCache.set(ctx.program, centralMap);
    }
    if (("/" + projectPath(ctx.projectRoot, ctx.sourceFile.fileName)).includes(constantsDir)) return;

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
