import ts from "typescript";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { resolveSymbol } from "../helpers/ast.js";

// An error inside a compilerOptions object (e.g. an option only a newer TypeScript knows) leaves the file set intact
function isOptionError(d: ts.Diagnostic): boolean {
  const root = d.file?.statements[0];
  if (d.start === undefined || !root || !ts.isExpressionStatement(root) || !ts.isObjectLiteralExpression(root.expression)) return false;
  const options = root.expression.properties.find(
    (p) => ts.isPropertyAssignment(p) && ts.isStringLiteral(p.name) && p.name.text === "compilerOptions"
  );
  return !!options && d.start >= options.pos && d.start < options.end;
}

// --format html builds two programs from one tsconfig: print each warning once per process
const reportedWarnings = new Set<string>();

export function createProgram(
  projectPath: string,
  tsconfigPath?: string
): { program: ts.Program; saveBuildInfo: () => void } {
  const configPath = resolve(projectPath, tsconfigPath ?? "tsconfig.json");
  const configText = ts.sys.readFile(configPath);
  if (configText === undefined) throw new Error(`tsconfig not found or unreadable: ${configPath}`);
  const parsed = ts.parseJsonSourceFileConfigFileContent(
    ts.parseJsonText(configPath, configText),
    ts.sys,
    dirname(configPath),
    undefined,
    configPath
  );
  const diagnostics = ts.getConfigFileParsingDiagnostics(parsed);
  // TypeScript numbers syntax errors below 2000: they and every error outside compilerOptions break the file set
  const fatal = diagnostics.filter((d) => d.code < 2000 || !isOptionError(d));
  if (fatal.length > 0) {
    throw new Error(`${configPath}: ${fatal.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`);
  }
  if (parsed.fileNames.length === 0) {
    throw new Error(`${configPath} includes no files - point "tsconfig" at a config whose include covers the sources (references are not followed)`);
  }
  for (const d of diagnostics) {
    const warning = `dlint: ${d.file?.fileName ?? configPath}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}\n`;
    if (reportedWarnings.has(warning)) continue;
    reportedWarnings.add(warning);
    process.stderr.write(warning);
  }
  const cacheDir = resolve(projectPath, "node_modules/.cache/dlint");
  const incrementalOptions = {
    ...parsed.options,
    incremental: true,
    tsBuildInfoFile: resolve(cacheDir, "dlint.tsbuildinfo"),
  } satisfies ts.CompilerOptions;
  const host = ts.createIncrementalCompilerHost(incrementalOptions, ts.sys);
  const builder = ts.createIncrementalProgram({
    rootNames: parsed.fileNames,
    options: incrementalOptions,
    host,
  });
  return {
    program: builder.getProgram(),
    saveBuildInfo: () => {
      try {
        mkdirSync(cacheDir, { recursive: true });
        builder.emit(undefined, (fileName, text) => {
          if (fileName.endsWith(".tsbuildinfo")) ts.sys.writeFile(fileName, text);
        });
      } catch { /* Cache is optional — lint works without it */ }
    },
  };
}

export function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  for (const s of sourceFile.statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === directive) return true;
  }
  return false;
}

export interface ExportedFunction {
  name: ts.Identifier;
  node: ts.Node;
  func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  body: ts.ConciseBody | undefined;
  parameters: ts.NodeArray<ts.ParameterDeclaration>;
}

export function getExportedFunctions(
  sf: ts.SourceFile,
  checker: ts.TypeChecker
): ExportedFunction[] {
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) return [];
  const seen = new Set<ts.Node>();
  const fns: ExportedFunction[] = [];
  // Every export form of this file (declarations, export lists, aliases) lands in the module's export table
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    for (const decl of resolveSymbol(checker, exp).declarations ?? []) {
      if (decl.getSourceFile() !== sf || seen.has(decl)) continue;
      seen.add(decl);
      if (ts.isFunctionDeclaration(decl) && decl.name) {
        fns.push({ name: decl.name, node: decl, func: decl, body: decl.body, parameters: decl.parameters });
      } else if (
        ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.initializer &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
      ) {
        const func = decl.initializer;
        fns.push({ name: decl.name, node: decl, func, body: func.body, parameters: func.parameters });
      }
    }
  }
  return fns;
}
