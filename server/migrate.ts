/**
 * Applies pending Drizzle SQL migrations from ./migrations.
 *
 * Runs as the Railway pre-deploy command (`node dist/migrate.cjs`) and locally
 * via `npm run db:migrate`. Exits non-zero on failure so a deploy is aborted
 * before the new version takes traffic.
 */
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";

async function main(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "migrations");
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] up to date");
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
