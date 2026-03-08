import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env or pass it directly."
    );
  }
  const sql = postgres(url);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
