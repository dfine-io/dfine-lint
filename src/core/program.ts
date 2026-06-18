import ts from "typescript";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";

export function createProgram(
  projectPath: string,
  tsconfigPath?: string
): { program: ts.Program; saveBuildInfo: () => void } {
  const configPath = ts.findConfigFile(
    projectPath,
    ts.sys.fileExists,
    tsconfigPath ?? "tsconfig.json"
  );
  if (!configPath) throw new Error(`No tsconfig.json found in ${projectPath}`);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath)
  );
  const cacheDir = resolve(projectPath, "node_modules/.cache/dlint");
  mkdirSync(cacheDir, { recursive: true });
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
        builder.emit(undefined, (fileName, text) => {
          if (fileName.endsWith(".tsbuildinfo")) ts.sys.writeFile(fileName, text);
        });
      } catch { /* Cache is optional — lint works without it */ }
    },
  };
}

export function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  const first = sourceFile.statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === directive;
}

export interface ExportedFunction {
  name: ts.Identifier;
  node: ts.Node;
  body: ts.Block | ts.ConciseBody | undefined;
  parameters: ts.NodeArray<ts.ParameterDeclaration>;
}

export function getExportedFunctions(
  sf: ts.SourceFile,
  checker: ts.TypeChecker
): ExportedFunction[] {
  const fns: ExportedFunction[] = [];

  ts.forEachChild(sf, (node) => {
    // export function name() { ... }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      checker.getSymbolAtLocation(node.name) &&
      ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export
    ) {
      fns.push({
        name: node.name,
        node,
        body: node.body,
        parameters: node.parameters,
      });
    }

    // export const name = async (...) => { ... }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.length > 0) {
      const firstDecl = node.declarationList.declarations[0];
      if (firstDecl && ts.getCombinedModifierFlags(firstDecl) & ts.ModifierFlags.Export) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const init = decl.initializer;
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
            fns.push({
              name: decl.name,
              node: decl,
              body: init.body,
              parameters: init.parameters,
            });
          }
        }
      }
    }
  });

  return fns;
}
