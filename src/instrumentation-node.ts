import { assertSafeDatabaseRole } from "@/db";

// Node.js runtime only (see instrumentation.ts): refuse to serve on an unsafe database role.
try {
  await assertSafeDatabaseRole();
} catch (e) {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
}
