// duplicate-import — flags multiple value-import declarations from the same module.
import ts from "typescript";
import { SyntaxKind } from "typescript"; // EXPECT: duplicate-import

// NEGATIVE: a single import from a different module (no duplicate)
import { isAbsolute } from "node:path";

export const _ = [ts.SyntaxKind.Unknown, SyntaxKind.Unknown, isAbsolute("/")];
