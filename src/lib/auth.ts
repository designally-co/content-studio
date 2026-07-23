import "server-only";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = "cs_session";
const SESSION_DAYS = 30;

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

/**
 * Session-signing secret: AUTH_SECRET env var in production; in local dev a
 * generated secret persisted under ./data so sessions survive restarts.
 */
function getSecret(): Uint8Array {
  if (process.env.AUTH_SECRET) {
    return new TextEncoder().encode(process.env.AUTH_SECRET);
  }
  const file = path.join(process.cwd(), "data", "auth-secret");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return new TextEncoder().encode(fs.readFileSync(file, "utf8"));
}

export type SessionUser = { id: string; email: string; name: string; role: string };

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setSubject(user.id)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Memoised per request. The layout, the page, and nested server components each
 * call this, so without `cache()` a single render fired 5-7 identical user
 * lookups. With a small connection pool that is the difference between a page
 * that renders and one that queues until Postgres' 120s statement_timeout.
 * React's cache() scope is one request, so a login/logout in the same request
 * still can't read a stale value.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let sub: string;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    sub = payload.sub as string;
  } catch {
    return null;
  }
  // The JWT signature can stay valid across a database switch (the signing
  // secret is persisted separately), so confirm the user still exists rather
  // than trusting a stale cookie — otherwise FK writes fail with a ghost id.
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, sub))
    .limit(1);
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

/** Whether any account exists yet (drives the first-run "create account" flow). */
export async function hasAnyUser(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  if (!user) return null;
  if (!user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
