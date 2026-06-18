// exhaustive-switch — switch over union/enum must cover all members or have a default.
type Color = "red" | "green" | "blue";

// POSITIVE: union switch missing a member, no default
export function missing(c: Color) {
  switch (c) { // EXPECT: exhaustive-switch
    case "red":
      return 1;
    case "green":
      return 2;
  }
  return 0;
}

// NEGATIVE: all members covered
export function complete(c: Color) {
  switch (c) {
    case "red":
      return 1;
    case "green":
      return 2;
    case "blue":
      return 3;
  }
}

// NEGATIVE: has a default clause
export function withDefault(c: Color) {
  switch (c) {
    case "red":
      return 1;
    default:
      return 0;
  }
}

// NEGATIVE: non-union discriminant (number) — rule only targets unions
export function notUnion(n: number) {
  switch (n) {
    case 1:
      return 1;
  }
  return 0;
}
