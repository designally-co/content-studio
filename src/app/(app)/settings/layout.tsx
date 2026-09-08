import { requireUser } from "@/lib/session";
import { PageHeading } from "@/components/page-heading";
import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";

/**
 * Shell shared by every Settings section.
 *
 * No sticky header. A title bar pinned to the top of a settings page buys
 * nothing — it repeats what the nav already says, and on a phone it stacked
 * under the app's own sticky header and covered the hamburger. The title is
 * content now: it scrolls away like the heading on Create, and the section nav
 * is what stays reachable.
 *
 * THE HEADING AND THE GUTTERS ARE THE ONES LIBRARY AND ROUTINES USE. Both were
 * typed out separately here and had drifted: a container 256px narrower than
 * every other page, so switching to Settings visibly nudged the whole app
 * inwards, and a copy of the `h1` that would have to be remembered every time
 * the real one changed. Sharing the component is what stops it happening a
 * third time.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await requireUser();

  return (
    <div className="min-h-svh bg-sunken">
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14 lg:px-12 xl:px-16">
        <PageHeading title="Settings" />

        <div className="mt-8 sm:mt-10 lg:flex lg:gap-14">
          <SettingsNav isAdmin={currentUser.role === "admin"} />
          {/* Capped independently of the page. Settings is a column of forms
              and prose, and a text field stretched to 1100px is harder to read
              and harder to aim at than one that stops where the sentence does —
              the page gutters match the rest of the app, the measure does not
              have to. */}
          <div className="min-w-0 max-w-3xl flex-1 space-y-14">{children}</div>
        </div>
      </div>
    </div>
  );
}
