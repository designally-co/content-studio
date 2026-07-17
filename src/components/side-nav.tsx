"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  IconDashboard,
  IconNew,
  IconLibrary,
  IconSettings,
  IconLogout,
} from "./icons";
import { logoutAction } from "@/app/actions";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/new", label: "New content", icon: IconNew, exact: false },
  { href: "/library", label: "Library", icon: IconLibrary, exact: false },
];

export function SideNav({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
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
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <UserFooter user={user} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 px-5 pb-8 pt-6">
        <Image src="/logo.png" alt="" width={36} height={36} priority />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">
            Designally
          </p>
          <p className="font-heading text-base font-bold tracking-tight text-ink">
            Content Studio
          </p>
        </div>
      </div>

        <NavLinks pathname={pathname} />
        <UserFooter user={user} pathname={pathname} />
      </aside>
    </>
  );
}

function MobileBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Image src="/logo.png" alt="" width={32} height={32} priority />
      <span className="truncate font-heading text-sm font-bold text-ink">Content Studio</span>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                active
                  ? "bg-accent-soft font-semibold text-accent-ink"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon
                className={active ? "text-accent" : "text-ink-3"}
                width={18}
                height={18}
              />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}

function UserFooter({
  user,
  pathname,
  onNavigate,
}: {
  user: { name: string; email: string };
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={`flex items-center gap-1 rounded-lg transition-colors ${active ? "bg-accent-soft" : "hover:bg-sunken"}`}>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-medium ${active ? "text-accent-ink" : "text-ink"}`}>
              Account &amp; Settings
            </p>
            <p className="truncate text-xs text-ink-3">{user.name} · {user.email}</p>
          </div>
          <IconSettings className={active ? "text-accent" : "text-ink-3"} width={17} height={17} />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="grid size-11 place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <IconLogout width={16} height={16} />
            </button>
          </form>
        </div>
    </div>
  );
}
