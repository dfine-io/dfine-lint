// Companion (not a *.fixture file → not run as a rule, but in the program for cross-file refs).
import { usedThing } from "./unused-export.fixture";

export const consumesUsed = usedThing;
