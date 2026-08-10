import { drizzle } from "drizzle-orm/postgres-js";
import type { SQL } from "drizzle-orm";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });

/**
 * Runs a raw query and names the row shape it selected. Raw results are
 * untyped, so this keeps the unchecked cast in one place instead of an `as
 * any[]` at every call site.
 */
export async function queryRows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}
