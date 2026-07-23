import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

export type DB = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Cache = { db: DB; ready: Promise<void> };

const globalCache = globalThis as unknown as { __contentStudioDb?: Cache };

function create(): Cache {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Supabase / any Postgres. `prepare: false` is required for Supabase's
    // transaction-mode connection pooler (port 6543).
    //
    // Keep the per-instance pool small: every serverless worker creates its own
    // client, and postgres-js defaults to max: 10, so a handful of concurrent
    // workers can exhaust the pooler and fail with EMAXCONNSESSION. A low max
    // plus a short idle timeout lets connections be recycled quickly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres") as typeof import("postgres");
    const client = postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
    const db = drizzlePostgres(client, { schema });

    // Every serverless cold start would otherwise run the full migrator (its
    // first statement is CREATE SCHEMA), which is pure overhead once the schema
    // is current and multiplies connections during request bursts. Set
    // SKIP_DB_MIGRATE=1 in a deployed environment and apply migrations from a
    // trusted place (a local boot, or `npm run db:migrate`) instead.
    const skipMigrate = process.env.SKIP_DB_MIGRATE === "1";
    const ready = (
      skipMigrate
        ? Promise.resolve()
        : migratePostgres(db, { migrationsFolder: MIGRATIONS }).then(() => seedIfEmpty(db))
    ).catch((error: unknown) => {
      // Never let a migration/seed hiccup take down every request: getDb()
      // awaits this, so a rejection here 500s the whole page even though the
      // schema is already applied. Log and continue; real query errors will
      // still surface normally.
      console.error("[db] migrate/seed failed, continuing without it:", error);
    });
    return { db, ready };
  }

  // Local development: embedded Postgres (PGlite), zero external services.
  // Swaps to Supabase by setting DATABASE_URL — same schema, same queries.
  const dataDir = path.join(process.cwd(), "data", "pg");
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  const ready = migratePglite(db, { migrationsFolder: MIGRATIONS }).then(() =>
    seedIfEmpty(db)
  );
  return { db, ready };
}

export async function getDb(): Promise<DB> {
  if (!globalCache.__contentStudioDb) {
    globalCache.__contentStudioDb = create();
  }
  await globalCache.__contentStudioDb.ready;
  return globalCache.__contentStudioDb.db;
}

export { schema };
