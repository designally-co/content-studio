/**
 * Standalone migration runner for a Postgres/Supabase DATABASE_URL.
 * Usage: DATABASE_URL=postgres://… npm run db:migrate
 *
 * Note: the app also applies migrations automatically on boot (src/db/index.ts).
 * This script is for applying them manually / in CI without starting the app.
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
