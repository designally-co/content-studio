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
/**
 * Whether the Anthropic key actually works, not merely whether it is set.
 *
 * That distinction is the reason this exists: a key can be present, correctly
 * formatted, and revoked, and every generation then fails with a 401 that the
 * browser reports as an anonymous server error. `GET /v1/models` is the
 * cheapest way to ask — it costs no tokens.
 *
 * Cached for a minute. The endpoint is unauthenticated, and an unauthenticated
 * route that makes an outbound call on demand is something to point at other
 * people's infrastructure.
 */
type ProviderCheck = { ok: boolean | null; status?: number; ms?: number; note?: string };
let anthropicCache: { at: number; result: ProviderCheck } | null = null;
const CHECK_TTL_MS = 60_000;

async function checkAnthropic(): Promise<ProviderCheck> {
  if (anthropicCache && Date.now() - anthropicCache.at < CHECK_TTL_MS) {
    return { ...anthropicCache.result, note: "cached" };
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, note: "ANTHROPIC_API_KEY is not set" };

  const t0 = Date.now();
  let result: ProviderCheck;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    result = { ok: res.ok, status: res.status, ms: Date.now() - t0 };
    if (res.status === 401) result.note = "key rejected — revoked, deleted, or mistyped";
  } catch (error) {
    // Unreachable is not the same as invalid, and must not be reported as it.
    result = {
      ok: null,
      ms: Date.now() - t0,
      note: error instanceof Error ? `unreachable: ${error.name}` : "unreachable",
    };
  }
  anthropicCache = { at: Date.now(), result };
  return result;
}

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

  const anthropic = await checkAnthropic();

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
    // `anthropic.ok === null` means the check could not be made, which is not
    // the same as the key being bad and must not be reported as unhealthy.
    ok:
      database.ok &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_SECRET &&
      anthropic.ok !== false,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    database,
    anthropic,
    env,
    missing,
    tookMs: Date.now() - started,
  };

  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
