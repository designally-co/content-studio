import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";

/** Server helper: require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
