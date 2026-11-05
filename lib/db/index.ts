import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb() {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? "";
  if (!connectionString) {
    throw new Error("DIRECT_DATABASE_URL is not set.");
  }
  const sql = postgres(connectionString, { prepare: false });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
