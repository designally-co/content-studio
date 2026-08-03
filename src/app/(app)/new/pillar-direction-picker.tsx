"use client";

import { useMemo } from "react";
import { Shapes, Newspaper, Palette, Sparkles, Layers, type LucideIcon } from "lucide-react";
import { MenuSelect } from "@/components/ui/menu-select";
import type { PillarGroup } from "./setup-form";

/** A representative icon per pillar (keyed by slug); a neutral fallback covers
 *  any pillar added later without a mapping. */
const PILLAR_ICONS: Record<string, LucideIcon> = {
  design: Palette,
  "new-update": Newspaper,
  "creative-things": Shapes,
  "ai-with-design": Sparkles,
};

/**
 * Compact two-level content picker: a row of pillar chips narrows the direction
 * dropdown beneath them. Emits a single hidden `categoryId` (the selected
 * direction) for the create-article form; the pillar is derived from it. The
 * caller supplies the field label. No free-form additions.
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
    <div className="space-y-2.5">
      <input type="hidden" name="categoryId" value={directionId} />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Content pillar">
        {pillars.map((pillar) => {
          const selected = pillar.id === activePillar?.id;
          const Icon = PILLAR_ICONS[pillar.slug] ?? Layers;
          return (
            <button
              key={pillar.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange({ pillarId: pillar.id, directionId: pillar.directions[0]?.id ?? "" })
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                selected
                  ? "border-accent bg-accent-soft text-accent-press"
                  : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
              {pillar.name}
            </button>
          );
        })}
      </div>

      <MenuSelect
        id="direction-select"
        ariaLabel="Content direction"
        value={directionId}
        options={(activePillar?.directions ?? []).map((direction) => ({ value: direction.id, label: direction.name }))}
        onChange={(value) => onChange({ pillarId: activePillar!.id, directionId: value })}
      />
    </div>
  );
}
