// Content-based, cwd-independent violation: a *Id parameter typed as plain string.
// Used by the config-resolve test to prove `dlint --config <file>` lints a subdir tsconfig
// program (resolved relative to the config dir) regardless of the cwd it is run from.
export function loadUser(userId: string): string {
  return userId; // EXPECT: unbranded-type-consistency@4
}
