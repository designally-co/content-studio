"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  authenticate,
  createSession,
  hasAnyUser,
  hashPassword,
} from "@/lib/auth";

export type AuthFormState = { error?: string };

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const user = await authenticate(email, password);
  if (!user) return { error: "Email or password is incorrect." };

  await createSession(user);
  redirect("/");
}

export async function registerFirstUserAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  if (await hasAnyUser()) {
    return { error: "An account already exists. Sign in instead." };
  }
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return { error: "All fields are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "admin",
    })
    .returning();

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  redirect("/");
}
