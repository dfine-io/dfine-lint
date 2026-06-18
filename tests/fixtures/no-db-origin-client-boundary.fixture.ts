"use server";
// no-db-origin-client-boundary — Server Action returning a Drizzle row type ($inferSelect).
declare const users: { $inferSelect: { id: number; name: string } };
type UserRow = typeof users.$inferSelect;
type UserView = { id: number };

// POSITIVE: Server Action returns a DB-origin row type
export async function getUser(): Promise<UserRow> { // EXPECT: no-db-origin-client-boundary
  return { id: 1, name: "x" };
}

// NEGATIVE: returns a hand-declared client-safe view
export async function getView(): Promise<UserView> {
  return { id: 1 };
}
