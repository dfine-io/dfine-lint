// Companion: imports a value from the fixture, while the fixture imports only a type from here.
import { fixtureVal } from "./no-import-cycle.fixture";

export type TypeOnlyShape = { n: number };
export const typeOnlyVal = fixtureVal + 1;
