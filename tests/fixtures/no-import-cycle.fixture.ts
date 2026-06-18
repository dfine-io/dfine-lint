// no-import-cycle — fixture <-> helper form a circular import (same SCC).
import { helperVal } from "./no-import-cycle.helper"; // EXPECT: no-import-cycle
import tsmod from "typescript"; // NEGATIVE: external lib import — never a cycle

export const fixtureVal = 1;
export const combined = helperVal + (tsmod ? 1 : 0);
