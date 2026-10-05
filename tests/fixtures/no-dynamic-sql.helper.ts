// no-dynamic-sql helper: a const imported into the fixture, and a query this module extends with raw text.
import { sql } from "drizzle-orm";
export const IMPORTED_TABLE = "users";
export const SHARED_QUERY = sql`SELECT * FROM t`;
export function sortShared(col: string): void {
  SHARED_QUERY.append(sql` ORDER BY ${sql.raw(col)}`);
}
