import ts from "typescript";

export interface TokenizedBlock {
  /** Normalized token sequence */
  tokens: string[];
  /** Original source file path */
  file: string;
  /** Function/block name (if available) */
  name: string;
  /** Start line */
  line: number;
  /** Statement count */
  stmtCount: number;
  /** Original AST node for reporting */
  node: ts.Node;
}

const TOKEN_MAP: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.IfKeyword]: "IF",
  [ts.SyntaxKind.ElseKeyword]: "ELSE",
  [ts.SyntaxKind.ForKeyword]: "FOR",
  [ts.SyntaxKind.WhileKeyword]: "WHILE",
  [ts.SyntaxKind.ReturnKeyword]: "RET",
  [ts.SyntaxKind.ConstKeyword]: "CONST",
  [ts.SyntaxKind.LetKeyword]: "LET",
  [ts.SyntaxKind.AwaitKeyword]: "AWAIT",
  [ts.SyntaxKind.NewKeyword]: "NEW",
  [ts.SyntaxKind.ThrowKeyword]: "THROW",
  [ts.SyntaxKind.TryKeyword]: "TRY",
  [ts.SyntaxKind.CatchKeyword]: "CATCH",
  [ts.SyntaxKind.SwitchKeyword]: "SWITCH",
  [ts.SyntaxKind.CaseKeyword]: "CASE",
  [ts.SyntaxKind.EqualsToken]: "=",
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "===",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!==",
  [ts.SyntaxKind.PlusToken]: "+",
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.AmpersandAmpersandToken]: "&&",
  [ts.SyntaxKind.BarBarToken]: "||",
  [ts.SyntaxKind.QuestionQuestionToken]: "??",
  [ts.SyntaxKind.DotToken]: ".",
  [ts.SyntaxKind.OpenParenToken]: "(",
  [ts.SyntaxKind.CloseParenToken]: ")",
  [ts.SyntaxKind.OpenBraceToken]: "{",
  [ts.SyntaxKind.CloseBraceToken]: "}",
  [ts.SyntaxKind.OpenBracketToken]: "[",
  [ts.SyntaxKind.CloseBracketToken]: "]",
  [ts.SyntaxKind.SemicolonToken]: ";",
  [ts.SyntaxKind.CommaToken]: ",",
  [ts.SyntaxKind.ColonToken]: ":",
  [ts.SyntaxKind.EqualsGreaterThanToken]: "=>",
};

/** Normalize an AST node into a token sequence, abstracting identifiers and literals */
function tokenizeNode(node: ts.Node, tokens: string[]): void {
  if (ts.isIdentifier(node)) {
    tokens.push("$ID");
    return;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    tokens.push("$STR");
    return;
  }
  if (ts.isNumericLiteral(node)) {
    tokens.push("$NUM");
    return;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    tokens.push("$BOOL");
    return;
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    tokens.push("$NULL");
    return;
  }

  const mapped = TOKEN_MAP[node.kind];
  if (mapped) {
    tokens.push(mapped);
  }

  ts.forEachChild(node, (child) => tokenizeNode(child, tokens));
}

function countStatements(node: ts.Node): number {
  if (ts.isBlock(node)) return node.statements.length;
  let count = 0;
  ts.forEachChild(node, (child) => {
    if (ts.isStatement(child)) count++;
  });
  return count;
}

function getFunctionName(node: ts.Node, sf: ts.SourceFile): string {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText(sf);
  }
  if (
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return "<anonymous>";
}

/** Extract all function-level blocks from a source file as tokenized sequences */
export function tokenizeFile(sf: ts.SourceFile): TokenizedBlock[] {
  const blocks: TokenizedBlock[] = [];

  function visit(node: ts.Node): void {
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(node) && node.body) body = node.body;
    else if (ts.isMethodDeclaration(node) && node.body) body = node.body;
    else if (ts.isArrowFunction(node) && ts.isBlock(node.body)) body = node.body;
    else if (ts.isFunctionExpression(node) && node.body) body = node.body;

    if (body) {
      const stmtCount = countStatements(body);
      if (stmtCount >= 5) {
        const tokens: string[] = [];
        tokenizeNode(body, tokens);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        blocks.push({
          tokens,
          file: sf.fileName,
          name: getFunctionName(node, sf),
          line: line + 1,
          stmtCount,
          node,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return blocks;
}

/** Compute Jaccard similarity between two token arrays */
export function tokenSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Use bigram sets for better accuracy than single tokens
  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(`${a[i]}|${a[i + 1]}`);
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(`${b[i]}|${b[i + 1]}`);

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
