// Counterparts for semantic-clone.fixture.ts: each body shares 85-90% of its tokens with its twin.
export function priceGross(amount: number): number {
  const net = amount * 2;
  const tax = net * 3;
  const fee = tax + 4;
  const ship = fee + 5;
  const sum = net + tax + fee + ship;
  return sum - 1;
}

export function readScaffold(input: unknown): string {
  const text = String(input);
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const upper = lower.toUpperCase();
  const parts = upper.split(";");
  return parts[0] ?? "";
}

export function stopJob(): string {
  const id = "job";
  const stamp = id + "-1";
  const full = stamp + "-x";
  const tagged = full + "!";
  const marked = tagged + "#";
  return marked + "?";
}
