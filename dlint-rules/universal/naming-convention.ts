// Flags naming convention violations: shadowing restricted names (undefined, NaN, Infinity)
// and label names shadowing variables.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Naming: shadow-restricted-names, label-var",
    subChecks: 2,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-shadow-restricted-names — shadowing undefined, NaN, Infinity
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) &&
          node.name && ts.isIdentifier(node.name)) {
        const restricted = new Set(["undefined", "NaN", "Infinity", "eval", "arguments"]);
        if (restricted.has(node.name.text)) {
          ctx.reportAt(node.name, `Rename variable -- shadows restricted name '${node.name.text}'`, {
            action: "rename", pattern: "Use a different variable name", reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar",
          });
        }
      }

      // no-label-var — label name shadows variable
      if (ts.isLabeledStatement(node) && !ctx.checker.getSymbolAtLocation(node.label)) {
        const labelName = node.label.text;
        let scope: ts.Node = node.parent;
        while (scope) {
          if ((ts.isBlock(scope) || ts.isSourceFile(scope)) &&
              ctx.checker.getSymbolsInScope(scope, ts.SymbolFlags.Variable).some(s => s.name === labelName)) {
            ctx.reportAt(node.label, `Label '${labelName}' shadows a variable with the same name`, {
              action: "rename-label", pattern: "Use a unique label name",
            });
            break;
          }
          scope = scope.parent;
        }
      }
    });
  },
});
