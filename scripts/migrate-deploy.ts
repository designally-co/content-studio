/**
 * Apply migrations as part of a Vercel production build.
 *
 * This exists because a release shipped five new columns and every article page
 * answered 500 with `column "origin" does not exist`. Nothing had applied the
 * migration: deployed environments set `SKIP_DB_MIGRATE=1`, so the app does not
 * migrate on boot, and nothing else did it either. The schema change had no
 * route to production at all.
 *
 * A build step is the right place for it. It runs once per deploy rather than
 * once per serverless cold start, which is the overhead `SKIP_DB_MIGRATE`
 * exists to avoid, and it runs BEFORE the new code starts serving — so an
 * additive migration is in place by the time anything queries the new column.
 *
 * Wired up as `vercel-build` in package.json, which Vercel runs in preference
 * to `build`. Deliberately not `build` itself: the Dockerfile runs that one,
 * and a container image build has no business migrating anybody's database.
 *
 * PRODUCTION ONLY, and that is the important part. Preview deployments are
 * built from branches whose migrations have not been reviewed or merged, and
 * they commonly point at the same DATABASE_URL. Running this on a preview would
 * apply an unmerged branch's schema change to the live database. Set
 * DB_MIGRATE_ON_BUILD=1 to force it somewhere else on purpose.
 *
 * It fails the build rather than warning. A deploy that could not migrate is a
 * deploy whose code expects columns the database does not have, and the whole
 * point of this file is that such a thing should never reach production
 * quietly again.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const env = process.env.VERCEL_ENV ?? "unknown";
const forced = process.env.DB_MIGRATE_ON_BUILD === "1";

if (!forced && env !== "production") {
  console.log(`[migrate-deploy] VERCEL_ENV=${env} — skipping. Production builds migrate; previews must not.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[migrate-deploy] DATABASE_URL is not set for this build.\n" +
      "  A production build cannot apply migrations without it, and shipping code that\n" +
      "  expects a newer schema than the database has is what this step exists to prevent.\n" +
      "  Expose DATABASE_URL to the Production environment in the Vercel project settings."
  );
  process.exit(1);
}

// max: 1 — one short-lived connection for one sequence of statements. This runs
// in a build container, not in a request path, so there is nothing to pool.
const client = postgres(url, { prepare: false, max: 1 });

try {
  const startedAt = Date.now();
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log(`[migrate-deploy] migrations applied in ${Date.now() - startedAt}ms`);
} catch (error) {
  // The message, never the connection string it came from — build logs are
  // more widely readable than the environment they were built in.
  console.error(
    "[migrate-deploy] migration failed, so this build will not be deployed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
