"use client";

import { useState } from "react";
import { CONTENT_PILLARS, pillarForDirection } from "@/lib/content-pillars";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CategoryToggle } from "./category-toggle";
import { Section } from "./section";

type Row = { id: string; name: string; active: boolean };

/**
 * Which topics are offered when starting an article.
 *
 * Grouped by pillar so thirty-four rows read as four scannable sections rather
 * than one undifferentiated wall.
 *
 * WHAT MATCHES NO PILLAR IS NOT SHOWN. These eight are the previous taxonomy —
 * "Design Principles", "Typography & Fonts" and the rest — every one of them
 * already inactive and none of them ever coming back. Listing them put a shut
 * drawer of dead names at the foot of the only screen where directions are
 * managed.
 *
 * THE ROWS THEMSELVES STAY IN THE DATABASE, and deliberately: a direction's id
 * is carried by every project filed under it, so deleting one orphans published
 * articles rather than tidying anything. Hidden and inactive, they are already
 * unreachable — from here, and from the picker on Create.
 */
export function Directions({ rows }: { rows: Row[] }) {
  /* What the switches have changed since the sheet opened, keyed by id. An
     override rather than a copy of the list: when the sheet reloads its data
     the fresh rows win for everything untouched, and anything touched already
     agrees with what was written. No effect, no resynchronising. */
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const isActive = (row: Row) => changed[row.id] ?? row.active;

  const groups = CONTENT_PILLARS.map((pillar) => ({
    name: pillar.name,
    rows: rows.filter((row) => pillarForDirection(row.name)?.slug === pillar.slug),
  })).filter((group) => group.rows.length > 0);
  return (
    <Section
      title="Content directions"
      description="Fixed to match the Hub's topics. Switch one off to hide it."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">No directions yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {groups.map((group) => {
            const activeCount = group.rows.filter(isActive).length;
            return (
              <AccordionItem
                key={group.name}
                value={group.name}
                className="overflow-hidden rounded-xl border-none bg-surface"
              >
                <AccordionTrigger className="items-center px-4 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1">
                    <span className="text-sm font-medium">{group.name}</span>
                    <span className="text-xs font-normal text-ink-3">
                      {activeCount} of {group.rows.length} active
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-2">
                  {/* No "Inactive" word beside an off switch. The switch is
                      already off, and printing it competes with the name of the
                      direction. Dimming the name carries it instead. */}
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          isActive(row) ? "text-ink" : "text-ink-3"
                        }`}
                      >
                        {row.name}
                      </span>
                      <CategoryToggle
                        id={row.id}
                        name={row.name}
                        active={isActive(row)}
                        onChanged={(next) =>
                          setChanged((prev) => ({ ...prev, [row.id]: next }))
                        }
                      />
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </Section>
  );
}
