// readability — as-'literal', nested template, nested ternary, nested switch, this-alias.
declare const cond: boolean;
declare const other: boolean;
declare const x: string;

// POSITIVE: `as "literal"` → as const
export const lit = "hello" as "hello"; // EXPECT: readability

// POSITIVE: nested template literal
export const tpl = `outer ${`inner ${x}`}`; // EXPECT: readability

// POSITIVE: nested ternary
export const tern = cond ? 1 : other ? 2 : 3; // EXPECT: readability

// POSITIVE: nested switch
export function nestedSwitch(n: number, m: number) {
  switch (n) {
    case 1:
      switch (m) { // EXPECT: readability
        case 1:
          return 1;
      }
      return 0;
  }
  return -1;
}

// POSITIVE: this-alias
export class C {
  method() {
    const self = this; // EXPECT: readability
    return self;
  }
}

// NEGATIVES
export const okConst = "x" as const;
export const okTern = cond ? 1 : 2;
