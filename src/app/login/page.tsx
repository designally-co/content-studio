import { redirect } from "next/navigation";

import { FlatMark } from "../mark";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { signIn, hasGoogleCredentials } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * The door, in the studio's own language.
 *
 * It was the team app's door ported whole — the Cut across the window, the
 * Point on it, a pill — and it was the one screen in this product drawn from
 * another product's stylesheet. It is now made of what every other screen
 * here is made of: one white plate on the ground, the flat mark, an eyebrow,
 * a heading in the display face, a deck, and the primary Button. Nothing on
 * it exists anywhere else at a different size or in a different colour.
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
    /* A CANVAS SURFACE, like Create: the page is the ground and one white
       object sits on it, centred, holding all the attention. Sized to the
       screen on a phone and locked in its frame (data-fits-viewport, the
       rule in globals.css); centred in whatever window a desktop offers. */
    <main
      data-fits-viewport=""
      className="flex min-h-dvh items-center justify-center bg-bg px-3 py-6 sm:px-6 sm:py-10"
    >
      {/* THE PLATE. The dock's own vocabulary — white, a hairline, the 16px
          corner — at the width of a form. No shadow: elevation here is
          structural, and the hairline is what says "object" on this ground. */}
      <section
        aria-labelledby="signin-title"
        className="w-full max-w-[26rem] rounded-2xl border border-line bg-surface p-6 sm:p-8"
      >
        {/* The flat mark, the one the rail carries: the D in ink, the full
            stop in the accent. The disc version is heavier than anything
            else on this plate, and the plate is already the object. */}
        <FlatMark size={36} />

        {/* Eyebrow, heading, deck — the rail's account block and every page
            heading are built from these same three lines. */}
        <p className="mt-7 text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
          Designally
        </p>
        <h1
          id="signin-title"
          className="mt-1.5 font-heading text-[length:var(--text-hero)] font-medium leading-[1.1] tracking-[-0.02em] text-ink"
        >
          Article Studio
        </h1>
        {/* What the product is for, in the one place the team sees it stated.
            It writes a draft from research; the editor still edits it — which
            is the promise this can actually keep. */}
        <p className="mt-3 text-sm leading-relaxed text-ink-2 sm:text-base">
          The draft you edit, instead of the blank page.
        </p>

        {hasGoogleCredentials ? (
          <form
            className="mt-8"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            {/* The primary Button, full width: the one action on the screen,
                in the accent, eight pixels, like every other commit. */}
            <Button type="submit" className="w-full">
              <GoogleGlyph />
              Continue with Google
            </Button>
          </form>
        ) : (
          /* Not a second way in — the state where there is no way in at all.
             Without it this page renders as a lockup over nothing, with the
             reason only in the server log. The same notice Create shows when
             a key is missing. */
          <div className="mt-8 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 text-sm leading-relaxed text-ink-2">
            <strong>Sign-in is not configured.</strong> Set <code>AUTH_GOOGLE_ID</code> and{" "}
            <code>AUTH_GOOGLE_SECRET</code>, and add this origin&rsquo;s{" "}
            <code>/api/auth/callback/google</code> to the OAuth client&rsquo;s authorised
            redirect URIs.
          </div>
        )}

        {/* Who can come in, stated under the door rather than discovered at
            it: a personal Google account gets as far as the consent screen
            and is turned away, and that is a worse place to learn the rule. */}
        <p className="mt-5 text-xs leading-relaxed text-ink-3">
          Designally Google Workspace accounts only.
        </p>
      </section>
    </main>
  );
}

/** Google's "G", flat, at the button's icon size. Drawn inline: it is the one
 *  place the product shows another brand's mark, and it is four paths. */
function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l3.9-3.1z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l3.9 3.1c1-2.8 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
