import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Google OAuth, restricted to the designally.co Workspace. One identity source,
 * nobody manages another password, and access dies with the Workspace account.
 *
 * This is the same configuration the team app runs (designally-platform
 * `src/auth.ts`), deliberately: two internal products signing people in two
 * different ways is how one of them ends up with the weaker gate.
 *
 * The domain check is enforced three times over, because each one alone can be
 * worked around: `hd` on the authorisation request narrows the account picker,
 * the `hd` claim on the returned profile is checked server-side, and the email
 * itself must end in the domain and be verified. The account picker hint is a
 * convenience; the other two are the gate.
 *
 * EVERYONE WHO SIGNS IN HERE IS AN ADMIN. That is not a simplification, it is
 * the current design: the only way in is a Designally Workspace account. The
 * `role` column still exists and `requireAdmin()` still reads it, so the day
 * password accounts come back for outside testers, `member` means something
 * again without any of this being rewritten. See PASSWORD_ACCOUNTS below.
 */
export const ALLOWED_DOMAIN = "designally.co";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const hasGoogleCredentials = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/**
 * Without Google credentials there are no providers at all — it fails safe, but
 * it fails silently, and a deploy nobody can sign into is worth catching at
 * build time rather than on Monday morning.
 *
 * There is no development fallback. Google is the only way in, in every
 * environment, which means local work needs an OAuth client too: add
 * http://localhost:3000/api/auth/callback/google to the same client's
 * authorised redirect URIs.
 */
if (process.env.NODE_ENV === "production" && !hasGoogleCredentials) {
  throw new Error(
    "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set in production — Content Studio has no " +
      "other way in. To build without an OAuth client, pass placeholders: " +
      "AUTH_GOOGLE_ID=x AUTH_GOOGLE_SECRET=y npm run build",
  );
}

function emailIsAllowed(email: string | null | undefined) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/**
 * The team member behind a `created_by` column. Created on first sign-in.
 *
 * Keyed on the email, so an account that already exists is reused rather than
 * duplicated — which is the whole of the migration story here. Every project,
 * draft and brand profile in the database points at a `users.id`, and those
 * rows were created under password sign-in. As long as the address on the
 * existing row is the person's Workspace address, their first Google sign-in
 * lands on the same id and their work stays theirs.
 *
 * If it does not match, they get a second row and their old projects are left
 * attributed to an account nobody can sign into any more. That is worth
 * checking before this ships, not after.
 */
export async function upsertUser(email: string, name: string) {
  const db = await getDb();
  const address = email.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  if (existing) {
    // A Workspace account is an administrator by definition of how it got here.
    // Re-asserting it on every sign-in also repairs a row that predates this.
    const changes: Partial<typeof users.$inferInsert> = {};
    if (name && name !== existing.name) changes.name = name;
    if (existing.role !== "admin") changes.role = "admin";
    if (Object.keys(changes).length > 0) {
      await db.update(users).set(changes).where(eq(users.id, existing.id));
    }
    return { id: existing.id, active: existing.active };
  }

  const [created] = await db
    .insert(users)
    .values({
      email: address,
      name: name || address,
      role: "admin",
      // No password. The column is nullable as of migration 0018 precisely so
      // an account can exist without one.
      passwordHash: null,
    })
    .returning();
  return { id: created.id, active: created.active };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    ...(hasGoogleCredentials
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            authorization: {
              params: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
            },
          }),
        ]
      : []),
  ],

  pages: { signIn: "/login" },

  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        // profile.hd is set by Google for Workspace accounts only
        const hd = (profile as { hd?: string } | undefined)?.hd;
        const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
        if (hd !== ALLOWED_DOMAIN) return false;
        if (verified === false) return false;
      }
      if (!emailIsAllowed(user?.email ?? profile?.email)) return false;

      // A disabled account is refused at the door rather than allowed to hold a
      // session that every page then rejects. `active` is how an administrator
      // removes someone who still has a live Workspace login.
      const email = (user?.email ?? profile?.email) as string;
      const record = await upsertUser(email, user?.name ?? "");
      return record.active;
    },

    async jwt({ token, user }) {
      // only on the sign-in pass, when `user` is present
      if (user?.email && emailIsAllowed(user.email)) {
        const record = await upsertUser(user.email, user.name ?? "");
        token.uid = record.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

export { hasGoogleCredentials };
