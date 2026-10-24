import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Migrations run as the schema owner (eclaira_owner); DATABASE_URL is the fallback for local dev. */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
