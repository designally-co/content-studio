"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Secondary navigation for Settings, adapting rather than shrinking.
 *
 * A four-cell tab grid was the previous approach: on a phone it wrapped to a
 * 2x2 block that read as a keypad and ate a third of the viewport before the
 * first field. Here the same destinations are one scrollable row on a phone and
 * a quiet rail beside the content on a desktop — the shape changes, the target
 * count doesn't.
 *
 * These are real routes now, so each section is linkable, survives the back
 * button, and no longer resets to Brand on every visit.
 */
type Section = { href: string; label: string; adminOnly?: boolean };

const SECTIONS: Section[] = [
  { href: "/settings/brand", label: "Brand" },
  { href: "/settings/content", label: "Content" },
  { href: "/settings/api", label: "API & models", adminOnly: true },
  { href: "/settings/automation", label: "Autopilot", adminOnly: true },
  { href: "/settings/account", label: "Account" },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = SECTIONS.filter((section) => !section.adminOnly || isAdmin);

  return (
    <>
      {/* Phone: one line, scrolled rather than wrapped. The row bleeds to the
          screen edges so a scrolled pill is never clipped mid-word against a
          page gutter. */}
      <nav
        aria-label="Settings sections"
        className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-1.5">
          {items.map((section) => {
            const active = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-ink"
                    : "text-ink-2 hover:bg-sunken hover:text-ink"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop: a rail of its own, sticky so it stays reachable beside a long
          brand form. Distinct from the app sidebar — this navigates within a
          page, not between destinations. */}
      <nav
        aria-label="Settings sections"
        className="hidden w-52 shrink-0 lg:block"
      >
        <div className="sticky top-8 space-y-1">
          {items.map((section) => {
            const active = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-lg px-3 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-ink"
                    : "text-ink-2 hover:bg-sunken hover:text-ink"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
