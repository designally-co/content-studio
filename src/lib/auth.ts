import "server-only";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/auth";

/**
 * The application's view of who is signed in.
 *
 * Sign-in itself is NextAuth + Google (see `src/auth.ts`). This file is the
 * layer everything else in the app talks to, and it keeps the shape it had
 * under password sign-in on purpose: `getSessionUser()` and the `SessionUser`
 * type are used by around forty call sites — every server action, every route
 * handler, the app layout — and none of them should have to know which
 * identity provider is behind them. Swapping the provider was a change to two
 * files rather than forty because of this.
 */

const scryptAsync = promisify(scrypt);

/**
 * Password hashing, kept but currently unused.
 *
 * Nothing signs in with a password today: Google is the only provider, and
 * the account-management screen that set passwords has been removed with it.
 *
 * These two stay because the plan is to reopen password accounts for outside
 * testers, and re-deriving a scrypt scheme later — salt length, key length,
 * the timing-safe compare — is exactly how the second implementation ends up
 * weaker than the first. Bringing them back means a Credentials provider in
 * `src/auth.ts` and a screen to create accounts from; the hashing is done.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export type SessionUser = { id: string; email: string; name: string; role: string };

/**
 * Memoised per request. The layout, the page, and nested server components each
 * call this, so without `cache()` a single render fired 5-7 identical user
 * lookups. With a small connection pool that is the difference between a page
 * that renders and one that queues until Postgres' 120s statement_timeout.
 *
 * The database read is not redundant with the session cookie. The cookie says
 * who signed in; the row says whether they are still allowed to be here. An
 * administrator disabling an account has to take effect on the next request,
 * not whenever a thirty-day session happens to expire.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const db = await getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user?.active) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
});
