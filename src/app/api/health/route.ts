import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { checkSchema, expectedMigrationCount, type SchemaCheck } from "@/lib/schema-status";

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
let hubCache: { at: number; result: ProviderCheck & { account?: string } } | null = null;
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

/**
 * Whether the Hub API key actually resolves to an account, not merely whether
 * it is set.
 *
 * Payload matches an API key to the `users` row that owns it. Delete that row,
 * disable its key, or carry a production key into a local environment whose
 * database has never seen it, and the key silently resolves to nobody — every
 * publish then 401s from inside a Server Action, where the browser reports it
 * as an anonymous server error.
 *
 * `GET /api/users/me` is the cheapest way to ask, and it has a trap worth
 * naming: Payload answers 200 with `user: null` for a key it does not
 * recognise. The status code alone cannot tell a working key from a dead one,
 * so this checks for the account, not for `res.ok`.
 *
 * The account is reported by id rather than by email — enough to confirm which
 * row the key belongs to by looking at the Hub's Users list, without an
 * unauthenticated endpoint naming a real address.
 */
async function checkHub(): Promise<ProviderCheck & { account?: string }> {
  if (hubCache && Date.now() - hubCache.at < CHECK_TTL_MS) {
    return { ...hubCache.result, note: "cached" };
  }
  const base = process.env.HUB_BASE_URL?.replace(/\/+$/, "");
  const key = process.env.HUB_API_KEY;
  if (!base || !key) return { ok: false, note: "HUB_BASE_URL or HUB_API_KEY is not set" };

  const t0 = Date.now();
  let result: ProviderCheck & { account?: string };
  try {
    const res = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `users API-Key ${key}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { user?: { id?: number | string } | null } | null;
    const account = json?.user?.id;
    const ms = Date.now() - t0;
    result =
      account != null
        ? { ok: true, status: res.status, ms, account: String(account) }
        : {
            ok: false,
            status: res.status,
            ms,
            note: "key resolves to no account — the user was deleted, its key was disabled, or the key belongs to another environment",
          };
  } catch (error) {
    result = {
      ok: null,
      ms: Date.now() - t0,
      note: error instanceof Error ? `unreachable: ${error.name}` : "unreachable",
    };
  }
  hubCache = { at: Date.now(), result };
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
    // Without it, grounded images have no photograph of a working scene to be
    // matched against, and fall back to a channel that rarely has one.
    UNSPLASH_ACCESS_KEY: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    HUB_BASE_URL: Boolean(process.env.HUB_BASE_URL),
    HUB_API_KEY: Boolean(process.env.HUB_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    // Not a secret, and the single most useful thing to know when the schema
    // is behind: it says whether this deployment applies migrations at all.
    SKIP_DB_MIGRATE: process.env.SKIP_DB_MIGRATE === "1",
  };

  const [anthropic, hub] = await Promise.all([checkAnthropic(), checkHub()]);

  let database: { ok: boolean; ms?: number; error?: string };
  let schema: SchemaCheck = { ok: null, expected: expectedMigrationCount, note: "not checked" };
  try {
    const t0 = Date.now();
    const db = await getDb();
    await db.execute(sql`select 1`);
    database = { ok: true, ms: Date.now() - t0 };
    // Only worth asking once the connection is known good — otherwise it would
    // report a schema problem for what is really an unreachable database.
    schema = await checkSchema(db);
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
    // `schema.ok === null` means the check could not be made, which is not the
    // same as the schema being wrong and must not be reported as it.
    ok:
      database.ok &&
      schema.ok !== false &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_SECRET &&
      anthropic.ok !== false,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    database,
    schema,
    anthropic,
    // Deliberately NOT part of `ok`. A Hub that is down or a key that has gone
    // stale stops publishing; it does not stop researching, drafting, or
    // generating images, which is most of what this app is. Reporting the whole
    // service unhealthy for it would cry wolf.
    hub,
    env,
    missing,
    tookMs: Date.now() - started,
  };

  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
