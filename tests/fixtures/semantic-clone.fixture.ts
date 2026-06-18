// semantic-clone — type-equivalent signature + 0.80-0.92 body similarity across files.
// Not deterministically synthesizable here: the 0.80-0.92 similarity band is too narrow to
// hand-tune (identical-structure twins land >=0.92 = syntactic; structurally-different twins
// fall <0.80), and it requires a cross-file type-equivalent-signature pair. Exercised against
// the real codebase. This fixture asserts the no-false-positive case (a lone function).
export function transform(x: number): number {
  const step1 = x + 1;
  const step2 = step1 * 2;
  const step3 = step2 - 3;
  return step3;
}
