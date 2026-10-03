// fix-island merge input, fixed with the opinionated group on: duplicate imports, a bare self-import, constructors.
import { a, b } from "./util";

class Base {
  constructor(readonly label: string = "") {}
}
export class Named extends Base {
  constructor() {
    super("named");
  }
}
export class Plain extends Base {
}
export const sum = a + b;
