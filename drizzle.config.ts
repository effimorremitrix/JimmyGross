import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // drizzle-kit acts on the schema, so it uses the owner role like scripts/migrate.ts.
  dbCredentials: { url: (process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL)! },
});
