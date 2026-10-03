// no-import-cycle — fixture <-> helper form a circular import (same SCC).
import { helperVal } from "./no-import-cycle.helper"; // EXPECT: no-import-cycle
import tsmod from "typescript"; // NEGATIVE: external lib import — never a cycle
import type { TypeOnlyShape } from "./no-import-cycle.typeonly"; // NEGATIVE: a type-only import loads nothing

export const fixtureVal = 1;
export type FixtureType = number;
export type Shape = TypeOnlyShape;
export default fixtureVal;
export const combined = helperVal + (tsmod ? 1 : 0);
