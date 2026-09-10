"use client";

import Link from "next/link";

import { FlatMark } from "@/app/mark";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { STAGE_CLOSE_BUTTON } from "@/app/(app)/pipeline/[id]/stages/stage-mobile";
import { AccountMenu } from "./account-menu";
import { SettingsSheet } from "./settings/settings-sheet";
import type { SettingsSection } from "./settings/sections";
import {
  IconNew,
  IconLibrary,
  IconRoutine,
} from "./icons";

/* Three destinations, and they are all places you do work. Settings was a
   fourth row here and is not a destination — it is the drawer you open while
   working somewhere else, so it moved into the account menu at the foot of the
   rail. */
const NAV = [
  { href: "/", label: "Create", icon: IconNew, exact: true },
  /* AN ARTICLE IS A LIBRARY ITEM, so the rail says Library while you are in
     one. `/pipeline/<id>` matched none of the three destinations, which left
     the menu showing a list with nothing current on it for the route people
     spend the most time on — every row equally unselected, as though the
     article were nowhere. It is not a fourth destination; it is where Library
     leads. */
  { href: "/library", label: "Library", icon: IconLibrary, exact: true, owns: "/pipeline/" },
  // A routine publishes to a live site with nobody reading it first, and the
  // page itself refuses anyone else — so the link is not offered either.
  { href: "/routines", label: "Routines", icon: IconRoutine, exact: false, adminOnly: true },
];

/** Routes that open with the panel out of the way. */
const COLLAPSED_ROUTES = new Set(["/"]);

export function SideNav({
  email,
  isAdmin = false,
}: {
  email: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Which settings section is showing, or null for closed. Held here rather
  // than in the menu so the sheet outlives the menu that opened it — a menu
  // closes on select, and a sheet mounted inside one would close with it.
  const [settings, setSettings] = useState<SettingsSection | null>(null);
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
      {/* NOT A HEADER ANY MORE — A BUTTON THAT STAYS PUT.
          This was a 64px bar in the chrome grey with a bottom rule, carrying
          the mark and "Content Studio" beside the hamburger. It named the app
          to somebody already inside it, on the smallest screen the app has,
          above every page whose first line is its own title — so the top of a
          phone read "Content Studio / Everything on the desk."

          What is left is the one thing the bar existed to hold. It still sits
          in the flow and still sticks, because a menu button you have to
          scroll back up to find is a menu button you cannot reach; but it is
          on the page's own ground with no rule under it, so there is no second
          surface up there, just a control. */}
      {/* AS WIDE AS THE BUTTON, NOT AS WIDE AS THE SCREEN. It still claims a
          48px line in the flow — that is what keeps it off the top of every
          page — but only the button's own width of it, which leaves the rest of
          that line for whatever the page wants to put there. The pipeline puts
          its stepper there, pulled up alongside.

          NO FILL OF ITS OWN. It had one, to hide a step scrolling past behind
          it — but the row now fades to nothing at that end on its own, and an
          opaque 64px block sitting in a bar that blurs whatever passes under it
          was the one square of the design where the page stopped showing
          through. The button's own disc is what keeps the icon legible. */}
      <div className="sticky top-0 z-(--z-nav) flex h-12 w-fit shrink-0 items-center px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          /* A CIRCLE, AND THE SAME ONE THE RAIL'S OWN TOGGLE IS. That control
             straddles the sidebar edge on a desktop and is drawn exactly this
             way — --border-strong, the page's ground, a card's shadow. This is
             the same job on a smaller screen, so it is not a second design. */
          /* 44px, unlike the steps beside it. That was the right call to refuse
             for a progress indicator you rarely press; this is the only way to
             reach the rest of the app from a phone, it is pressed constantly,
             and it sits in the top corner where a thumb is least accurate. */
          /* THE DISC THAT CLOSES IT, OPENING IT. Outlined and lifted, it was
             the heaviest thing on the top of the screen — a hairline, a
             shadow and a fill competing with the stepper beside it for a
             control you press twice a session. The same soft grey disc as
             every close button in the app: one shape for "the menu", pressed
             either way. */
          className={`size-11 ${STAGE_CLOSE_BUTTON}`}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <Menu aria-hidden className="size-5" />
        </button>
      </div>

      {open && (
        /* ON THE NAV'S OWN LAYER, NOT THE BACKDROP'S. The drawer is the rail,
           folded away — and the account menu at its foot is set one step above
           the rail so it can clear it. At --z-backdrop the drawer outranked
           its own menu: pressing the account row on a phone lit the trigger
           and painted the menu underneath the panel, so Brand, Content and
           Sign out were never reachable from a small screen. Sheets and
           dialogs sit two steps up and still cover it. */
        <div className="fixed inset-0 z-(--z-drawer) lg:hidden">
          <aside
            id="mobile-navigation"
            /* THE WHOLE SCREEN, AND NO SCRIM BEHIND IT. This was a 17rem panel
               over a dimmed page, which is the right shape when what is behind
               it still matters — but nothing here is a preview of the page you
               came from, and a sliver of dimmed work at the right edge was an
               invitation to tap the one part of the screen that does nothing
               but dismiss. Full bleed states it plainly: this is navigation,
               you are in it, and the way out is the button where the way in
               was. The scrim came out with the gutter it lived in; Escape and
               the close button are the two ways back, and both are explicit.

               No border and no shadow either — both drew the edge of a panel
               that no longer has one. */
            /* THE PAGE'S OWN GROUND, not the rail's. `bg-chrome` is the colour
               of a panel beside the work; at full screen there is no work
               beside it, and the close disc — a grey a single step off chrome —
               went invisible on it. On the app ground the drawer reads as a
               screen you navigated to, and every surface the close button
               appears on is now the same colour under it. */
            className="relative flex h-full w-full flex-col bg-bg"
            aria-label="Mobile navigation"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-16 items-center justify-between gap-3 border-b border-line pl-7 pr-4">
              <MobileBrand />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                /* THE SAME DISC AS EVERY OTHER CLOSE IN THE APP, from the one
                   constant, so the drawer's and the sheets' cannot drift. A
                   square-cornered ghost button was the only rounded-lg thing
                   on a surface of pills. */
                className={`size-11 ${STAGE_CLOSE_BUTTON}`}
                aria-label="Close navigation"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
            <div className="shrink-0 border-t border-line px-4 pb-4 pt-3">
              <AccountMenu
                email={email}
                isAdmin={isAdmin}
                onOpenSettings={(section) => {
                  // The drawer goes first. Leaving it open behind the sheet
                  // would put a full-height panel under a modal and hand back
                  // a covered screen when the sheet closes.
                  setOpen(false);
                  setSettings(section);
                }}
              />
            </div>
          </aside>
        </div>
      )}

      <aside
        // z-(--z-nav) both lifts the nav over a route's sticky header and gives
        // the overhanging toggle a stacking context of its own to live in.
        className={`relative z-(--z-nav) hidden min-h-dvh shrink-0 self-stretch border-r border-line-strong bg-chrome transition-[width] duration-(--duration-base) ease-(--ease-out) lg:block ${
          collapsed ? "w-20" : "w-60"
        }`}
      >
        <div className="sticky top-0 flex h-dvh flex-col">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          /* The rail's own outline, at rest. This sat on --border, which is the
             hairline for a plate on white — against the page it is the page,
             so a control straddling the rail's edge had a visible boundary on
             one side and nothing on the other. It takes the same
             --border-strong the rail is drawn with, and darkens on hover. */
          className="absolute -right-4 top-5 z-10 grid size-8 place-items-center rounded-full border border-line-strong bg-bg text-ink-2 shadow-[var(--shadow-card)] transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
        </button>

        {/* The brandmark holds one position across both states — only the
            wordmark beside it appears and disappears, so collapsing reads as
            the panel narrowing rather than as the logo jumping.

            ON THE TABS' OWN EDGE. The rail pads its list by 16 and each row
            pads its icon by another 12, so every destination icon starts at 28
            — and the logo, padded once at 16, started 12px to their left. One
            vertical line runs down the panel now instead of two. Collapsed,
            both were already centred in the same 80px. */}
        <div className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center px-0" : "gap-3 pl-7 pr-4"}`}>
          <FlatMark size={32} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
                Designally
              </p>
              <p className="font-heading text-base font-semibold tracking-tight text-ink">
                Article Studio
              </p>
            </div>
          )}
        </div>
        <div className={`h-px shrink-0 bg-line ${collapsed ? "mx-3" : "mx-4"}`} />

        <NavLinks pathname={pathname} isAdmin={isAdmin} collapsed={collapsed} />

        {/* NavLinks takes the slack, so this sits on the floor of the rail
            whether there are three destinations or thirty. */}
        <div className={`shrink-0 border-t border-line pb-4 pt-3 ${collapsed ? "px-2" : "px-4"}`}>
          <AccountMenu
            email={email}
            isAdmin={isAdmin}
            collapsed={collapsed}
            onOpenSettings={setSettings}
          />
        </div>
        </div>
      </aside>

      {/* Mounted outside both panels: the sheet belongs to the app, not to the
          rail that happened to open it. */}
      {settings && (
        <SettingsSheet section={settings} onClose={() => setSettings(null)} />
      )}
    </>
  );
}
function MobileBrand() {
  return (
    /* THE RAIL'S LOCKUP, NOT A SMALLER COUSIN OF IT. The drawer had the mark
       and one line of 13px type; the rail has the mark, "Designally" over the
       product name, and both start on the tabs' own vertical line at 28. Two
       different brand blocks for the same brand, and the phone got the lesser
       one — which mattered more once the drawer went full screen and became
       the only thing on the display. Same gap, same sizes, same eyebrow. */
    <div className="flex min-w-0 items-center gap-3">
      <FlatMark size={32} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
          Designally
        </p>
        <p className="truncate font-heading text-base font-semibold tracking-tight text-ink">
          Article Studio
        </p>
      </div>
    </div>
  );
}

function NavLinks({ pathname, isAdmin, onNavigate, collapsed = false }: { pathname: string; isAdmin: boolean; onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav className={`flex-1 space-y-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-4"}`} aria-label="Primary navigation">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon, exact, owns }) => {
          const active =
            (owns !== undefined && pathname.startsWith(owns)) ||
            (exact
              ? pathname === href
              : pathname === href || pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              // Collapsed rows are square and centred. A full-width pill behind
              // a lone centred icon reads as a mis-sized target, not a state.
              /* ONE DIFFERENCE, NOT FOUR. The current row used to change its
                 fill, its ink, its weight AND its icon colour all at once —
                 four signals for one fact. It changes surface and nothing
                 else: same ink, same weight, same icon as every row beside it,
                 sitting on a grey two steps down from the rail. Hover is the
                 step between, so the pointer reads as a preview of selection
                 rather than as a different idea. */
              className={`flex min-h-12 items-center rounded-xl text-base font-medium text-ink transition-colors duration-(--duration-fast) ease-(--ease-out) ${collapsed ? "mx-auto size-12 justify-center px-0" : "gap-3 px-3"} ${
                active ? "bg-chrome-active" : "hover:bg-chrome-hover"
              }`}
            >
              <Icon className="text-ink" width={20} height={20} />
              <span className={collapsed ? "sr-only" : ""}>{label}</span>
            </Link>
          );
        })}
    </nav>
  );
}

