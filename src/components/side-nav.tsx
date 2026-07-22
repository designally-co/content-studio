"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  IconNew,
  IconLibrary,
  IconSettings,
} from "./icons";

const NAV = [
  { href: "/", label: "Library", icon: IconLibrary, exact: true },
  { href: "/new", label: "Create", icon: IconNew, exact: false },
  { href: "/settings", label: "Settings", icon: IconSettings, exact: false },
];

export function SideNav() {
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
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 px-5 pb-8 pt-6">
        <BrandMark size={36} />
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
      </aside>
    </>
  );
}
/** Designally "D." brandmark — dark bowl with a coral period, on a square canvas. */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 340 340"
      fill="none"
      role="img"
      aria-label="Designally"
      className="shrink-0"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#1B1D23"
        d="M37 40H163C223 40 287 92 287 170C287 248 223 300 163 300H47A26 26 0 0 1 21 274V56A16 16 0 0 1 37 40ZM86 108H159C201 108 227 132 227 170C227 208 201 232 159 232H86V108Z"
      />
      <circle cx="283" cy="262" r="36" fill="#EF6148" />
    </svg>
  );
}

function MobileBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark size={32} />
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
