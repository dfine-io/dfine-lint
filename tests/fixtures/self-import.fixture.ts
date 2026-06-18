// self-import — a file importing itself.
import * as self from "./self-import.fixture"; // EXPECT: self-import
import ts from "typescript"; // NEGATIVE: import from a different module

export const value = 1;
export const usesBoth = [typeof self, typeof ts];
