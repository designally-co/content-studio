"use client";

import { DropdownMenu } from "radix-ui";
import { LogOut, Fingerprint, FileText, KeyRound, ChevronsUpDown } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { SECTION_LABELS, type SettingsSection } from "./settings/sections";

/**
 * Who you are, and everything that is about you rather than about the work.
 *
 * SETTINGS WAS A FOURTH NAV ROW, sitting under Create, Library and Routines as
 * though it were a fourth place to work. It is not — it is the drawer you open
 * while working somewhere else, and Account was a page inside it whose entire
 * content was your address and a Sign out button.
 *
 * Both live here now: the identity IS the trigger, so the address is on screen
 * without a section to hold it, and Sign out is one press from it rather than
 * three. That leaves the sidebar listing only the three things you actually do.
 *
 * It sits at the bottom because that is where an account belongs in a rail —
 * far from the destinations, last in the tab order, out of the way of the work.
 */
export function AccountMenu({
  email,
  isAdmin,
  collapsed = false,
  onOpenSettings,
}: {
  email: string;
  isAdmin: boolean;
  collapsed?: boolean;
  onOpenSettings: (section: SettingsSection) => void;
}) {
  /* NOT A PALETTE. That icon means colour, artwork, a design tool — and this
     section holds none of it: a name, a tone of voice, terminology, rules, and
     who the writing is for. Nothing in it is visual, and the logo upload that
     was its only visual thing is gone. A fingerprint is the identity itself,
     which is what "brand" means here, and it does not collide with the
     document or the key beside it. */
  const sections: { key: SettingsSection; icon: typeof Fingerprint }[] = [
    { key: "brand", icon: Fingerprint },
    { key: "content", icon: FileText },
    ...(isAdmin ? [{ key: "api" as const, icon: KeyRound }] : []),
  ];

  /* Each item states its own colour rather than inheriting one. Utilities of
     equal specificity resolve by the order Tailwind emits them, so a shared
     `text-ink` base silently won over the destructive item's red. */
  const item =
    "flex min-h-11 w-full cursor-default select-none items-center gap-3.5 rounded-lg px-3 text-base font-normal outline-none transition-colors data-disabled:pointer-events-none data-disabled:opacity-50";
  const normal = `${item} text-ink data-highlighted:bg-sunken`;
  const destructive = `${item} text-danger-ink data-highlighted:bg-danger-soft`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account and settings"
        title={collapsed ? email : undefined}
        className={`flex min-h-12 items-center rounded-xl text-ink transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-chrome-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] data-[state=open]:bg-chrome-active ${
          collapsed ? "mx-auto size-12 justify-center px-0" : "w-full gap-3 px-3"
        }`}
      >
        <Initials email={email} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{email}</span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-3" />
          </>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          /* Upwards, because the trigger is at the bottom of the screen. Radix
             flips it on its own when there is no room, and the collision
             padding keeps it off the viewport edge either way. */
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          /* No border. The shadow already separates it from the page, and a
             hairline as well makes a floating layer look like a boxed one. */
          className="z-(--z-nav-dropdown) w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl bg-surface p-2 shadow-[var(--shadow-pop)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
        >
          <DropdownMenu.Label className="flex items-center gap-3 px-3 py-2.5">
            <Initials email={email} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{email}</span>
              <span className="block text-xs text-ink-3">
                {isAdmin ? "Administrator" : "Team member"}
              </span>
            </span>
          </DropdownMenu.Label>

          <Rule />

          {sections.map(({ key, icon: Icon }) => (
            <DropdownMenu.Item
              key={key}
              className={normal}
              onSelect={() => onOpenSettings(key)}
            >
              <Icon aria-hidden className="size-[18px] shrink-0" />
              {SECTION_LABELS[key]}
            </DropdownMenu.Item>
          ))}

          <Rule />

          {/* A form, not a fetch: signing out is a server action, and a button
              inside a form still works if the page's JavaScript never arrives. */}
          <form action={logoutAction}>
            <DropdownMenu.Item asChild className={destructive}>
              <button type="submit">
                <LogOut aria-hidden className="size-[18px] shrink-0" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Rule() {
  return <div className="mx-3 my-1.5 h-px bg-line" />;
}

/**
 * The first letter of the address. Not a photo: there is one shared team
 * account and no avatar to load, so a coloured disc with a letter is the whole
 * truth rather than a placeholder standing in for something missing.
 */
function Initials({ email }: { email: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white"
    >
      {email.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
