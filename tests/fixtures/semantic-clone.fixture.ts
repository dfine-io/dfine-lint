// semantic-clone — type-equivalent signature + 0.80-0.92 body similarity across files.
// The counterparts live in semantic-clone.helper.ts; tests/dlint.config.ts sets minParams 0 so the
// zero-parameter pair reaches the signature check. The rule reports at the file's first statement (@4).
export function transform(x: number): number {
  const step1 = x + 1;
  const step2 = step1 * 2;
  const step3 = step2 - 3;
  return step3;
}

// POSITIVE: same signature, 85% of the body (a bigram set would score it 77% and miss it)
export function priceTotal(amount: number): number { // EXPECT: semantic-clone@4
  const net = amount * 2;
  const tax = net * 3;
  const fee = tax + 4;
  const ship = fee + 5;
  const sum = net + tax + fee + ship;
  const rounded = sum - 1;
  return rounded;
}

// NEGATIVE: a parameter that accepts anything (unknown) proves no shared contract
export function parseScaffold(input: unknown): string {
  const text = String(input);
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const upper = lower.toUpperCase();
  const parts = upper.split(",");
  const first = parts[0] ?? "";
  return first;
}

// POSITIVE: zero parameters pair; the repeats put it at 90% (a set says 100%, which syntactic-clone
// would claim, while its own measure sees 90%: one measure for both rules leaves no gap)
export function startJob(): string { // EXPECT: semantic-clone@4
  const id = "job";
  const stamp = id + "-1";
  const full = stamp + "-x";
  const tagged = full + "!";
  const marked = tagged + "#";
  const done = marked + "?";
  return done;
}
