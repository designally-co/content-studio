import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — what is actually deployed, and can it reach what it needs.
 *
 * This exists because of an afternoon spent guessing. A change that is
 * server-side only — a route's `maxDuration`, a migration, an environment
 * variable — is invisible from outside the app, so "is my fix live?" had no
 * answer short of asking somebody to open the Vercel dashboard. Twice that
 * turned a one-line fix into a round of speculation.
 *
 * Deliberately unauthenticated: its whole job is to be reachable when nobody
 * can sign in, which is exactly when it is needed. It is therefore careful
 * about what it says. Environment variables are reported as present/absent
 * booleans and never by value, and the database is proved with `select 1`
 * rather than by reading a row.
 *
 * `commit` is the honest answer to "did my push deploy?" — compare it with
 * `git rev-parse --short HEAD`.
 */
export async function GET() {
  const started = Date.now();

  // Presence only. Never the value, and never a length — a length is a hint.
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_GOOGLE_ID: Boolean(process.env.AUTH_GOOGLE_ID),
    AUTH_GOOGLE_SECRET: Boolean(process.env.AUTH_GOOGLE_SECRET),
    ENCRYPTION_KEY: Boolean(process.env.ENCRYPTION_KEY),
    FAL_KEY: Boolean(process.env.FAL_KEY),
    HUB_BASE_URL: Boolean(process.env.HUB_BASE_URL),
    HUB_API_KEY: Boolean(process.env.HUB_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
  };

  let database: { ok: boolean; ms?: number; error?: string };
  try {
    const t0 = Date.now();
    const db = await getDb();
    await db.execute(sql`select 1`);
    database = { ok: true, ms: Date.now() - t0 };
  } catch (error) {
    // The message, not the stack, and not the connection string it came from.
    database = { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" };
  }

  const missing = Object.entries(env)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  const body = {
    // DATABASE_URL is deliberately absent in local development, where empty
    // means embedded PGlite. Health is whether the database answered, not how
    // it was configured.
    ok: database.ok && env.ANTHROPIC_API_KEY && env.AUTH_GOOGLE_ID && env.AUTH_SECRET,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    database,
    env,
    missing,
    tookMs: Date.now() - started,
  };

  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
