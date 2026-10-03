// fix-island merge input, fixed with the opinionated group on: duplicate imports, a bare self-import, constructors.
import { a } from "./util";
import { b } from "./util";
import "./merge";

class Base {
  constructor(readonly label: string = "") {}
}
export class Named extends Base {
  constructor() {
    super("named");
  }
}
export class Plain extends Base {
  constructor() {
    super();
  }
}
export const sum = a + b;
