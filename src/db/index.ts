import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool; db?: NodePgDatabase<typeof schema> };

function create() {
  // DATABASE_URL is the runtime role (eclaira_app). Migrations and the seed use
  // DATABASE_OWNER_URL instead; see scripts/ and docs/COMPLIANCE.md.
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

/**
 * Startup guard, called from src/instrumentation.ts before the server takes
 * requests. A superuser can skip the append-only evidence triggers
 * (session_replication_role = replica), so production refuses to run as one.
 * The owner of the evidence tables can disable their triggers, so it is refused
 * too: on managed Postgres even the admin is usually not a superuser.
 * Fails closed: a role that cannot be checked is not accepted either.
 */
export async function assertSafeDatabaseRole(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const { rows } = await globalForDb
    .pool!.query<{ role: string; superuser: string; owner: boolean | null }>(
      `SELECT current_user AS role, current_setting('is_superuser') AS superuser,
              pg_has_role(current_user, (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_events'), 'MEMBER') AS owner`,
    )
    .catch((e: unknown) => {
      throw new Error(`Refusing to start: could not check the database role (${e instanceof Error ? e.message : e}).`);
    });
  const r = rows[0];
  const unsafe = r?.superuser === "on" ? "a Postgres superuser" : r?.owner ? "the owner of the evidence tables" : null;
  if (unsafe) {
    throw new Error(
      `Refusing to start: DATABASE_URL connects as "${r.role}", ${unsafe}, which can bypass the append-only ` +
        "evidence triggers. Use the eclaira_app role (docs/COMPLIANCE.md).",
    );
  }
}
