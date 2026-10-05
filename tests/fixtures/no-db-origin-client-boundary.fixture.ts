"use server";
// no-db-origin-client-boundary — Server Action returning a Drizzle row type ($inferSelect).
import { pgTable, serial, text } from "drizzle-orm/pg-core";

const users = pgTable("users", { id: serial("id").primaryKey(), name: text("name").notNull() });
type UserRow = typeof users.$inferSelect;
type UserView = { id: number };
// A project object with a $inferSelect member is no drizzle-orm table
declare const lookalike: { $inferSelect: { id: number } };
type LookalikeRow = typeof lookalike.$inferSelect;

// POSITIVE: Server Action returns a DB-origin row type
export async function getUser(): Promise<UserRow> { // EXPECT: no-db-origin-client-boundary
  return { id: 1, name: "x" };
}

// NEGATIVE: returns a hand-declared client-safe view
export async function getView(): Promise<UserView> {
  return { id: 1 };
}

// NEGATIVE: the row API's name on a project type
export async function getLookalike(): Promise<LookalikeRow> {
  return { id: 1 };
}
