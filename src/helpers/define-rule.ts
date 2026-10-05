import ts from "typescript";
import type {
  RuleDefinition,
  RuleContext,
  Advisory,
  DefineRuleOptions,
  EnhancedRuleContext,
} from "../types.js";

export function defineRule(opts: DefineRuleOptions): RuleDefinition {
  const rule = {
    id: "",
    meta: opts.meta,
    severity: opts.meta.severity ?? "error",
    nodeTypes: opts.nodeTypes ?? [],
    check(ctx: RuleContext) {
      const kinds =
        opts.nodeTypes && opts.nodeTypes.length > 0
          ? new Set(opts.nodeTypes)
          : null;
      const enhanced = {
        ...ctx,
        walk(callback: (node: ts.Node) => void) {
          function visit(node: ts.Node): void {
            if (!kinds || kinds.has(node.kind)) callback(node);
            ts.forEachChild(node, visit);
          }
          visit(ctx.sourceFile);
        },
        createFix(node: ts.Node, newText: string) {
          return { start: node.getStart(ctx.sourceFile), length: node.getWidth(ctx.sourceFile), newText };
        },
        insertBefore(node: ts.Node, text: string) {
          return { start: node.getStart(ctx.sourceFile), length: 0, newText: text };
        },
        insertAfter(node: ts.Node, text: string) {
          return { start: node.getEnd(), length: 0, newText: text };
        },
        deleteNode(node: ts.Node) {
          const sf = ctx.sourceFile;
          // A statement that is the whole body of an if, loop or label becomes {} so the next line stays unconditional
          const parent = node.parent;
          if (ts.isStatement(node) && !ts.isBlock(parent) && !ts.isSourceFile(parent) && !ts.isModuleBlock(parent) && !ts.isCaseOrDefaultClause(parent)) {
            return { start: node.getStart(sf), length: node.getWidth(sf), newText: "{}" };
          }
          // A node alone on its lines takes the lines with it, indentation and line break included
          let start = node.getStart(sf);
          let end = node.getEnd();
          const lineStart = sf.text.lastIndexOf("\n", start - 1) + 1;
          const nextBreak = sf.text.indexOf("\n", end);
          const lineEnd = nextBreak === -1 ? sf.text.length : nextBreak + 1;
          if (/^[ \t]*$/.test(sf.text.slice(lineStart, start)) && /^[ \t]*\r?\n?$/.test(sf.text.slice(end, lineEnd))) {
            start = lineStart;
            end = lineEnd;
          }
          return { start, length: end - start, newText: "" };
        },
        reportAt(node: ts.Node, message: string, advisory?: Advisory, subCheck?: string) {
          const pos = ctx.sourceFile.getLineAndCharacterOfPosition(
            node.getStart(ctx.sourceFile)
          );
          // Resolve relative reference paths against referencesDir (path-like stays as-is)
          const resolved =
            advisory?.reference && !advisory.reference.includes("/")
              ? { ...advisory, reference: `${ctx.referencesDir}/${advisory.reference}` }
              : advisory;
          ctx.report({
            rule: rule.id,
            severity: opts.meta.severity ?? "error",
            line: pos.line + 1,
            column: pos.character + 1,
            message,
            advisory: resolved,
            subCheck,
          });
        },
      } satisfies EnhancedRuleContext;
      opts.check(enhanced);
    },
  } satisfies RuleDefinition;
  return rule;
}
