// Flags syntax antipatterns: nested ternaries, deeply nested callbacks,
// excessive chaining, and overly long expressions.
// Complex syntax makes code harder to read, debug, and maintain.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Modern JS syntax: no-var, prefer-const, prefer-template, object-shorthand",
    subChecks: 8,
  },
  check(ctx) {
    ctx.walk((node) => {
      // 1. no-var — var → let/const
      if (ts.isVariableStatement(node)) {
        const flags = node.declarationList.flags;
        if (!(flags & ts.NodeFlags.Let) && !(flags & ts.NodeFlags.Const)) {
          // Skip ambient declarations (declare global / declare module)
          let parent = node.parent;
          while (parent) {
            if (ts.isModuleDeclaration(parent)) return;
            parent = parent.parent;
          }
          ctx.reportAt(node, "Use let or const instead of var", {
            action: "replace-var", pattern: "Use let or const instead of var",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let",
          });
        }
      }

      // 2. prefer-const — let without reassign (AST-Walk symbol identity, no findReferences)
      if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Let)) {
        for (const decl of node.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const sym = ctx.checker.getSymbolAtLocation(decl.name);
          if (!sym) continue;
          let hasWrite = false;
          function checkWrite(n: ts.Node): void {
            if (hasWrite) return;
            if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
                n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(n.left)) {
              if (ctx.checker.getSymbolAtLocation(n.left) === sym) { hasWrite = true; return; }
            }
            if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && ts.isIdentifier(n.operand)) {
              if (ctx.checker.getSymbolAtLocation(n.operand) === sym) { hasWrite = true; return; }
            }
            ts.forEachChild(n, checkWrite);
          }
          const block = decl.parent?.parent?.parent;
          if (block) checkWrite(block);
          if (hasWrite) continue;
          // Safe: reassignment already ruled out. Fix only a single-declaration list (the
          // let/const keyword is shared, so `let a, b` cannot flip just one to const).
          ctx.reportAt(decl, "Use const — variable is never reassigned", {
            action: "use-const",
            pattern: "Use const instead of let - the variable is never reassigned",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const",
            ...(node.declarations.length === 1
              ? { fix: { start: node.getStart(ctx.sourceFile), length: 3, newText: "const" } }
              : {}),
          });
        }
      }

      // 3. prefer-template — string concatenation with + where one side is string
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const lt = ctx.checker.getTypeAtLocation(node.left);
        const rt = ctx.checker.getTypeAtLocation(node.right);
        const leftIsStr = !!(lt.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral));
        const rightIsStr = !!(rt.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral));
        if (!leftIsStr && !rightIsStr) return;
        if (ts.isStringLiteral(node.left) && ts.isStringLiteral(node.right)) return;
        if (ts.isTemplateExpression(node.parent) || ts.isNoSubstitutionTemplateLiteral(node.parent)) return;
        ctx.reportAt(node, "Use template literal instead of string concatenation", {
          action: "use-template", pattern: "Use a template literal instead of string concatenation",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals",
        });
      }

      // 4. prefer-spread — .apply(null/undefined, args) → ...args
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "apply" && node.arguments.length === 2) {
        const firstArg = node.arguments[0];
        if (!firstArg) return;
        if (firstArg.kind === ts.SyntaxKind.NullKeyword || firstArg.kind === ts.SyntaxKind.UndefinedKeyword ||
            (ts.isIdentifier(firstArg) && ctx.checker.getTypeAtLocation(firstArg).flags & ts.TypeFlags.Undefined)) {
          ctx.reportAt(node, "Use spread instead of .apply()", {
            action: "use-spread", pattern: "Use spread fn(...args) instead of fn.apply(null, args)",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax",
          });
        }
      }

      // 5. prefer-rest-params — arguments object usage
      if (ts.isIdentifier(node) && node.text === "arguments") {
        const sym = ctx.checker.getSymbolAtLocation(node);
        if (sym && sym.flags & ts.SymbolFlags.FunctionScopedVariable) {
          ctx.reportAt(node, "Use rest parameters instead of arguments", {
            action: "use-rest", pattern: "Use rest parameters (...args) instead of the arguments object",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters",
          });
        }
      }

      // 6. prefer-exponentiation-operator — Math.pow → **
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "pow" && ts.isIdentifier(node.expression.expression)) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression.expression);
        if (sym && isLibDeclaration(sym)) {
          ctx.reportAt(node, "Use ** operator instead of Math.pow()", {
            action: "use-exponentiation", pattern: "Use the ** operator instead of Math.pow(x, y)",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Exponentiation",
          });
        }
      }

      // 7. prefer-numeric-literals — parseInt with base 2/8/16
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length === 2) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!sym || !isLibDeclaration(sym)) return;
        if (node.expression.text !== "parseInt") return;
        const radix = node.arguments[1];
        if (!radix) return;
        if (!ts.isNumericLiteral(radix)) return;
        const val = Number(radix.text);
        if (val !== 2 && val !== 8 && val !== 16) return;
        const prefix = val === 2 ? "0b" : val === 8 ? "0o" : "0x";
        // Fix only when the source is a string literal of digits valid in that base.
        const firstArg = node.arguments[0];
        const digitRe = val === 2 ? /^[01]+$/ : val === 8 ? /^[0-7]+$/ : /^[0-9a-fA-F]+$/;
        const canFix = !!firstArg && ts.isStringLiteral(firstArg) && digitRe.test(firstArg.text);
        ctx.reportAt(node, `Use ${prefix} prefix instead of parseInt`, {
          action: "use-numeric-literal",
          pattern: "Use a numeric literal (0b1010) instead of parseInt('1010', 2)",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar",
          ...(canFix && firstArg && ts.isStringLiteral(firstArg)
            ? { fix: ctx.createFix(node, prefix + firstArg.text) }
            : {}),
        });
      }

      // 8. prefer-regex-literals — new RegExp with string literal
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const sym = ctx.checker.getSymbolAtLocation(node.expression);
        if (!sym || !isLibDeclaration(sym)) return;
        if (node.expression.text !== "RegExp") return;
        const reArg = node.arguments?.[0];
        if (!reArg || !ts.isStringLiteral(reArg)) return;
        ctx.reportAt(node, "Use regex literal instead of new RegExp()", {
          action: "use-regex-literal", pattern: "Use a regex literal /pattern/ instead of new RegExp('pattern')",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp",
        });
      }

    });
  },
});
