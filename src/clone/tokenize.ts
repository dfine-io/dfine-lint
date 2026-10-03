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

// Statement keywords and braces are no child nodes: control flow maps by node kind, operators by token kind
const TOKEN_MAP: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.IfStatement]: "IF",
  [ts.SyntaxKind.ForStatement]: "FOR",
  [ts.SyntaxKind.ForInStatement]: "FOR",
  [ts.SyntaxKind.ForOfStatement]: "FOR",
  [ts.SyntaxKind.WhileStatement]: "WHILE",
  [ts.SyntaxKind.DoStatement]: "WHILE",
  [ts.SyntaxKind.ReturnStatement]: "RET",
  [ts.SyntaxKind.AwaitExpression]: "AWAIT",
  [ts.SyntaxKind.AwaitKeyword]: "AWAIT",
  [ts.SyntaxKind.NewExpression]: "NEW",
  [ts.SyntaxKind.ThrowStatement]: "THROW",
  [ts.SyntaxKind.TryStatement]: "TRY",
  [ts.SyntaxKind.CatchClause]: "CATCH",
  [ts.SyntaxKind.SwitchStatement]: "SWITCH",
  [ts.SyntaxKind.CaseClause]: "CASE",
  [ts.SyntaxKind.EqualsToken]: "=",
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "===",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!==",
  [ts.SyntaxKind.PlusToken]: "+",
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.AmpersandAmpersandToken]: "&&",
  [ts.SyntaxKind.BarBarToken]: "||",
  [ts.SyntaxKind.QuestionQuestionToken]: "??",
  [ts.SyntaxKind.CommaToken]: ",",
  [ts.SyntaxKind.ColonToken]: ":",
  [ts.SyntaxKind.EqualsGreaterThanToken]: "=>",
};

// const and let carry no keyword node; the declaration list's flags tell them apart
const DECLARATION_TOKEN: Partial<Record<number, string>> = {
  [ts.NodeFlags.Const]: "CONST",
  [ts.NodeFlags.Let]: "LET",
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

  const mapped = ts.isVariableDeclarationList(node)
    ? DECLARATION_TOKEN[node.flags & ts.NodeFlags.BlockScoped]
    : TOKEN_MAP[node.kind];
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

// Both clone rules tokenize the whole program: one pass per source file serves both
const blockCache = new WeakMap<ts.SourceFile, TokenizedBlock[]>();

/** Extract all function-level blocks from a source file as tokenized sequences */
export function tokenizeFile(sf: ts.SourceFile): TokenizedBlock[] {
  const cached = blockCache.get(sf);
  if (cached) return cached;
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
  blockCache.set(sf, blocks);
  return blocks;
}

const bigramCache = new WeakMap<readonly string[], Set<string>>();

// Bigram set of a token array, cached: the clone rules compare each array against many others
function bigramsOf(tokens: readonly string[]): Set<string> {
  const cached = bigramCache.get(tokens);
  if (cached) return cached;
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) bigrams.add(`${tokens[i]}|${tokens[i + 1]}`);
  bigramCache.set(tokens, bigrams);
  return bigrams;
}

/** Compute Jaccard similarity between two token arrays; sequences without bigrams score 0 */
export function tokenSimilarity(a: readonly string[], b: readonly string[]): number {
  const bigramsA = bigramsOf(a);
  const bigramsB = bigramsOf(b);
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
