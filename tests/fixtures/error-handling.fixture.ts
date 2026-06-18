// error-handling — empty catch (no comment) + re-throw new Error without { cause }.
// Markers use @line: the empty-catch rule treats ANY nearby comment as "intentional",
// so the EXPECT marker must live away from the catch.

export const emptyCatch = () => {
  try {
    JSON.parse("{}");
  } catch (e) {}
};

export function noCause() {
  try {
    JSON.parse("{}");
  } catch (e) {
    throw new Error("failed");
  }
}

// NEGATIVE: empty catch WITH an intentional-empty comment (own line)
export const emptyOk = () => {
  try {
    JSON.parse("{}");
  } catch (e) {
    // intentionally empty
  }
};

// NEGATIVE: re-throw WITH cause chain
export function withCause() {
  try {
    JSON.parse("{}");
  } catch (e) {
    throw new Error("failed", { cause: e });
  }
}

// EXPECT: error-handling@8
// EXPECT: error-handling@15
