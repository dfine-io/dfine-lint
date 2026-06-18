// Companion: imports back from the fixture → closes the cycle.
import { fixtureVal } from "./no-import-cycle.fixture";

export const helperVal = fixtureVal + 1;
