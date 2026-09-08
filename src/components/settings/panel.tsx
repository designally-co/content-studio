"use client";

import { useState } from "react";
import { Collapsible } from "radix-ui";
import { ChevronDown } from "lucide-react";

/**
 * A settings section that stays folded until you ask for it.
 *
 * THE ROUTINE SHEET'S ADVANCED-SETTINGS PANEL, SHARED RATHER THAN COPIED. Same
 * bordered panel on the sheet's ground, same heading-and-subline trigger, same
 * chevron that turns. Two panels that behave identically should be one piece of
 * code, or they drift the first time either is touched.
 *
 * IT NEVER UNMOUNTS ITS FIELDS, and that is a correctness requirement rather
 * than a preference. Brand is ONE form with ONE Save, and `saveBrandAction`
 * writes every column it can name — `formData.get("audience") ?? ""`. A closed
 * panel whose inputs had left the DOM would submit nothing for them, and saving
 * a change to the brand NAME would silently blank the audience, the tone notes
 * and every rule underneath it. Radix unmounts collapsed content by default, so
 * this forces it mounted and hides it by collapsing a grid row instead — the
 * fields are still there, still submitted, just not drawn.
 *
 * `inert` while closed is the other half of that: content kept in the DOM to be
 * submitted must not also be reachable by Tab, or a keyboard user falls into a
 * panel that looks shut.
 */
export function SettingsPanel({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="rounded-2xl border border-(--sheet-line,var(--border)) bg-(--sheet-plate,var(--surface))"
    >
      <Collapsible.Trigger className="group/panel flex w-full items-start justify-between gap-4 rounded-2xl p-4 text-left outline-none focus-visible:shadow-[var(--shadow-focus)] sm:p-5">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-ink">{title}</span>
          {description && (
            <span className="mt-0.5 block text-sm leading-relaxed text-ink-3">{description}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) ease-(--ease-out) group-data-open/panel:rotate-180"
        />
      </Collapsible.Trigger>

      {/* A grid row from 0fr to 1fr, which animates height without anyone
          measuring it — and without the unmount that a height animation on
          Radix's own data-attributes would need. */}
      <Collapsible.Content
        forceMount
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--duration-base) ease-(--ease-out) data-open:grid-rows-[1fr] motion-reduce:transition-none"
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="space-y-5 border-t border-(--sheet-line,var(--border)) p-4 sm:p-5">
            {children}
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
