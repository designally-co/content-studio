import { redirect } from "next/navigation";
import { getSessionUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const firstRun = !(await hasAnyUser());

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <header className="mb-10">
          <p className="text-sm font-medium text-accent-ink">Designally</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Content Studio
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            {firstRun
              ? "Welcome. Create the first team account to get started."
              : "Sign in with your team account."}
          </p>
        </header>
        <LoginForm firstRun={firstRun} />
      </div>
    </main>
  );
}
