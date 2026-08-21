"use server";

import { signOut } from "@/auth";

/**
 * Sign out and return to the sign-in screen.
 *
 * `signOut` clears the NextAuth session cookie and redirects; it does not sign
 * the person out of Google itself, which is correct — this is one app on a
 * shared Workspace login, not the login.
 */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
