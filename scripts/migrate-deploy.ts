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

/**
 * WHY IT FAILED, NOT JUST THAT IT DID. Drizzle wraps every error — a refused
 * password, an unknown pooler user, a full pool, a dropped socket — in the same
 * "Failed query: CREATE SCHEMA …", which is the first statement the migrator
 * sends and says nothing about the cause. The real error is on `.cause`. This
 * walks the chain and prints each code and first line, and never a connection
 * string: build logs are more widely readable than the environment they were
 * built in.
 */
function reason(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const err = current as { code?: string; message?: string; cause?: unknown };
    const line = [err.code, err.message?.split("\n")[0]].filter(Boolean).join(" ");
    if (line && !parts.includes(line)) parts.push(line);
    current = err.cause;
  }
  return (parts.join(" <- ") || String(error)).replace(/postgres(ql)?:\/\/\S+/g, "<url>").slice(0, 400);
}

async function migrateOnce(): Promise<void> {
  // max: 1 — one short-lived connection for one sequence of statements. This
  // runs in a build container, not in a request path, so there is nothing to pool.
  const client = postgres(url!, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end({ timeout: 5 });
  }
}

/* ONE RETRY. A build's single connection to the pooler can fail for a moment —
   265559c's did, a minute after ee5766f's succeeded against the same database
   with the same URL. Migrations are idempotent (applied ones are recorded), so
   trying again is safe; a real misconfiguration fails twice and still stops the
   deploy, now with its reason in the log. */
const startedAt = Date.now();
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    await migrateOnce();
    console.log(
      `[migrate-deploy] migrations applied in ${Date.now() - startedAt}ms${attempt > 1 ? ` (on attempt ${attempt})` : ""}`
    );
    break;
  } catch (error) {
    if (attempt === 1) {
      console.warn(`[migrate-deploy] attempt 1 failed — ${reason(error)} — retrying once in 10s`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      continue;
    }
    console.error(`[migrate-deploy] migration failed, so this build will not be deployed — ${reason(error)}`);
    process.exitCode = 1;
  }
}
