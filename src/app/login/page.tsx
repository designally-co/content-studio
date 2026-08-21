import { redirect } from "next/navigation";

import Mark from "../mark";
import { getSessionUser } from "@/lib/auth";
import { signIn, hasGoogleCredentials } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * The door, and it is the team app's door.
 *
 * Ported from designally-platform `src/app/sign-in/page.tsx`: the Cut running
 * the full width of the window with the Point sitting on it, the lockup, one
 * line saying what the product is for, and one pill.
 *
 * ONE WAY IN. Google SSO on a Designally Workspace account, in every
 * environment including local development. There is no password field, no
 * "create an account", and no development fallback — a second way in that
 * exists only sometimes is the one nobody checks, and this page is the whole
 * perimeter.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getSessionUser();
  const { from } = await searchParams;
  // A path inside this app, never an absolute URL — an open redirect on a
  // sign-in page hands somebody else's site the trust of this domain.
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  if (user) redirect(target);

  return (
    <main className="signin">
      <div className="card">
        <div className="sl-cut">
          <Mark size={60} />
        </div>

        <h1 className="sl-lockup">Designally Content Studio</h1>

        {/* What the product is for, in the one place the team sees it stated.
            It writes a draft from research; the editor still edits it — which
            is the promise this can actually keep. */}
        <p className="sl-line">The draft you edit, instead of the blank page.</p>

        {hasGoogleCredentials ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            <button className="sl-cta" type="submit">
              Continue with Google
            </button>
          </form>
        ) : (
          /* Not a second way in — the state where there is no way in at all.
             Without it this page renders as a lockup over nothing, with the
             reason only in the server log. */
          <p className="sl-line">
            Sign-in is not configured. Set <code>AUTH_GOOGLE_ID</code> and{" "}
            <code>AUTH_GOOGLE_SECRET</code>, and add this origin&rsquo;s{" "}
            <code>/api/auth/callback/google</code>{" "}
            to the OAuth client&rsquo;s authorised redirect URIs.
          </p>
        )}
      </div>
    </main>
  );
}
