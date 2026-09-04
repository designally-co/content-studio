/**
 * Standalone migration runner for a Postgres/Supabase DATABASE_URL.
 * Usage: DATABASE_URL=postgres://… npm run db:migrate
 *
 * This is the manual runner: a server without the Vercel build step, a fix
 * applied by hand, a CI job. Production deploys use `scripts/migrate-deploy.ts`
 * instead, via the `vercel-build` script.
 *
 * The app can also migrate on boot (src/db/index.ts), but deployed environments
 * set SKIP_DB_MIGRATE=1 and therefore do not. Do not count on it.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Set it to your Postgres/Supabase connection string.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations applied.");
