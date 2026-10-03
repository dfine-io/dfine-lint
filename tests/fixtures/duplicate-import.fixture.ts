// duplicate-import — flags multiple value-import declarations from the same module.
import ts from "typescript";
import { SyntaxKind } from "typescript"; // EXPECT: duplicate-import
// A default import next to a type specifier is a value import, so it duplicates the one above
import tsAgain, { type Node } from "typescript"; // EXPECT: duplicate-import

// NEGATIVE: an `import type` beside value imports of one module cannot merge into them
import type { Program } from "typescript";

// NEGATIVE: a single import from a different module (no duplicate)
import { isAbsolute } from "node:path";

export const _ = [ts.SyntaxKind.Unknown, SyntaxKind.Unknown, isAbsolute("/"), tsAgain.version];
export type AnyNode = Node;
export type AnyProgram = Program;
