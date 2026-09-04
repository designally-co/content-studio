"use client";

import Link from "next/link";

import { FlatMark } from "@/app/mark";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import {
  IconNew,
  IconLibrary,
  IconRoutine,
  IconSettings,
} from "./icons";

const NAV = [
  { href: "/", label: "Create", icon: IconNew, exact: true },
  { href: "/library", label: "Library", icon: IconLibrary, exact: true },
  // A routine publishes to a live site with nobody reading it first, and the
  // page itself refuses anyone else — so the link is not offered either.
  { href: "/routines", label: "Routines", icon: IconRoutine, exact: false, adminOnly: true },
  { href: "/settings", label: "Settings", icon: IconSettings, exact: false },
];

/** Routes that open with the panel out of the way. */
const COLLAPSED_ROUTES = new Set(["/"]);

export function SideNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The route decides the opening state and nothing else ever does: only the
  // toggle moves the panel after that. A sidebar that reflows when you follow
  // a link makes the link feel like it did something other than navigate, and
  // the width change costs more attention than the labels are worth.
  const [collapsed, setCollapsed] = useState(() => COLLAPSED_ROUTES.has(pathname));
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-(--z-sticky) flex h-16 items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-sunken focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <Menu className="size-5" />
        </button>
        <MobileBrand />
      </header>

      {open && (
        <div className="fixed inset-0 z-(--z-backdrop) lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/20"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-navigation"
            className="relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-line bg-surface shadow-[var(--shadow-pop)]"
            aria-label="Mobile navigation"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <MobileBrand />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-sunken focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <aside
        // z-(--z-nav) both lifts the nav over a route's sticky header and gives
        // the overhanging toggle a stacking context of its own to live in.
        className={`relative z-(--z-nav) hidden min-h-dvh shrink-0 self-stretch border-r border-line bg-surface transition-[width] duration-(--duration-base) ease-(--ease-out) lg:block ${
          collapsed ? "w-20" : "w-60"
        }`}
      >
        <div className="sticky top-0 flex h-dvh flex-col">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-4 top-5 z-10 grid size-8 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-[var(--shadow-card)] transition-colors duration-(--duration-fast) ease-(--ease-out) hover:border-line-strong hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
        </button>

        {/* The brandmark holds one position across both states — only the
            wordmark beside it appears and disappears, so collapsing reads as
            the panel narrowing rather than as the logo jumping. */}
        <div className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}>
          <FlatMark size={32} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">
                Designally
              </p>
              <p className="font-heading text-base font-bold tracking-tight text-ink">
                Content Studio
              </p>
            </div>
          )}
        </div>
        <div className={`h-px shrink-0 bg-line ${collapsed ? "mx-3" : "mx-4"}`} />

        <NavLinks pathname={pathname} isAdmin={isAdmin} collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
function MobileBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <FlatMark size={32} />
      <span className="truncate font-heading text-sm font-bold text-ink">Content Studio</span>
    </div>
  );
}

function NavLinks({ pathname, isAdmin, onNavigate, collapsed = false }: { pathname: string; isAdmin: boolean; onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav className={`flex-1 space-y-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-4"}`} aria-label="Primary navigation">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              // Collapsed rows are square and centred. A full-width pill behind
              // a lone centred icon reads as a mis-sized target, not a state.
              className={`flex min-h-11 items-center rounded-lg text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${collapsed ? "mx-auto size-11 justify-center px-0" : "gap-2.5 px-3 py-2.5"} ${
                active
                  ? "bg-accent-soft font-semibold text-accent-ink"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon
                className={active ? "text-accent" : "text-ink-3"}
                width={collapsed ? 20 : 18}
                height={collapsed ? 20 : 18}
              />
              <span className={collapsed ? "sr-only" : ""}>{label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
