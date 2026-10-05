// Content-based, cwd-independent violation: a plain-string parameter whose only caller passes a UserId.
// Used by the config-resolve test to prove `dlint --config <file>` lints a subdir tsconfig
// program (resolved relative to the config dir) regardless of the cwd it is run from.
type UserId = string & { readonly __brand: "UserId" };
export function loadUser(userId: string): string {
  return userId; // EXPECT: unbranded-type-consistency@5
}
export const loaded = loadUser("u1" as UserId);
