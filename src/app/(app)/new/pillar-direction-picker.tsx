"use client";

import { useMemo } from "react";
import { MenuSelect } from "@/components/ui/menu-select";
import type { PillarGroup } from "./setup-form";

/**
 * Fixed two-level content picker: choose a Content Core Pillar, then one of its
 * content directions. Emits a single hidden `categoryId` (the selected
 * direction) for the create-article form. No free-form additions.
 */
export function PillarDirectionPicker({
  pillars,
  pillarId,
  directionId,
  onChange,
}: {
  pillars: PillarGroup[];
  pillarId: string;
  directionId: string;
  onChange: (next: { pillarId: string; directionId: string }) => void;
}) {
  const activePillar = useMemo(
    () => pillars.find((pillar) => pillar.id === pillarId) ?? pillars[0],
    [pillars, pillarId]
  );

  if (pillars.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-sunken/50 px-4 py-3 text-sm text-ink-3">
        No content pillars are configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="categoryId" value={directionId} />

      <div>
        <span className="cs-label">Content pillar</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {pillars.map((pillar) => {
            const selected = pillar.id === activePillar?.id;
            return (
              <button
                key={pillar.id}
                type="button"
                onClick={() =>
                  onChange({ pillarId: pillar.id, directionId: pillar.directions[0]?.id ?? "" })
                }
                aria-pressed={selected}
                className={`rounded-xl border p-3.5 text-left transition-colors ${
                  selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <span className="block text-sm font-semibold text-ink">{pillar.name}</span>
                {pillar.tagline && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{pillar.tagline}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="cs-label">Content direction</span>
        <MenuSelect
          id="direction-select"
          ariaLabel="Content direction"
          value={directionId}
          options={(activePillar?.directions ?? []).map((direction) => ({ value: direction.id, label: direction.name }))}
          onChange={(value) => onChange({ pillarId: activePillar!.id, directionId: value })}
        />
      </div>
    </div>
  );
}
