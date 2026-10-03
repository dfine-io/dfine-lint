// Companion: imports back from the fixture → closes the cycle. A default import next to a type
// specifier is still a value import, so this edge counts.
import fixtureDefault, { type FixtureType } from "./no-import-cycle.fixture";

export const helperVal: FixtureType = fixtureDefault + 1;
