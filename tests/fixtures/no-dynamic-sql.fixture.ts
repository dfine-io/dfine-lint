// no-dynamic-sql — db.execute() with dynamic input; static string / sql`` allowed.
interface DbMock {
  select(...a: unknown[]): Promise<unknown[]>;
  insert(t: unknown): Promise<unknown>;
  update(t: unknown): Promise<unknown>;
  delete(t: unknown): Promise<unknown>;
  execute(query: unknown): Promise<unknown>;
}
declare const db: DbMock;
declare const userInput: string;

// POSITIVE: dynamic string concatenation in execute()
export async function dynamic() {
  await db.execute("SELECT * FROM t WHERE id = " + userInput); // EXPECT: no-dynamic-sql
}

// NEGATIVE: static string literal
export async function staticSql() {
  await db.execute("SELECT 1");
}
