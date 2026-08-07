import { requireUser } from "@/lib/session";
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
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await requireUser();

  return (
    <div className="min-h-svh bg-sunken">
      <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14 lg:px-12">
        <h1 className="font-heading text-[length:var(--text-h1)] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[length:var(--text-hero)]">
          Settings
        </h1>

        <div className="mt-8 lg:flex lg:gap-14 lg:mt-12">
          <SettingsNav isAdmin={currentUser.role === "admin"} />
          <div className="min-w-0 flex-1 space-y-14">{children}</div>
        </div>
      </div>
    </div>
  );
}
