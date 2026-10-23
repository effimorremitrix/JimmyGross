import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool; db?: NodePgDatabase<typeof schema> };

function create() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return { pool, db: drizzle(pool, { schema }) };
}

if (!globalForDb.db) {
  const { pool, db } = create();
  globalForDb.pool = pool;
  globalForDb.db = db;
}

export const db = globalForDb.db!;
export type Db = typeof db;
export { schema };
