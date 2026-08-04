"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Layers, Newspaper, Palette, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { PillarGroup } from "./setup-form";

const PILLAR_ICONS: Record<string, LucideIcon> = {
  design: Palette,
  "new-update": Newspaper,
  "creative-things": Shapes,
  "ai-with-design": Sparkles,
};

export function pillarIcon(slug: string | undefined): LucideIcon {
  return (slug && PILLAR_ICONS[slug]) || Layers;
}

type Selection = { pillarId: string; directionId: string };

/** Compact pillar → direction drill-down menu for the composer dock. */
export function PillarDirectionPicker({
  pillars,
  selection,
  open,
  onOpenChange,
  onChange,
  children,
}: {
  pillars: PillarGroup[];
  selection: Selection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: Selection) => void;
  children: React.ReactNode;
}) {
  const [activePillarId, setActivePillarId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activePillar = pillars.find((pillar) => pillar.id === activePillarId);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activePillarId, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setActivePillarId(null);
    onOpenChange(nextOpen);
  }

  function choose(next: Selection) {
    onChange(next);
    onOpenChange(false);
  }

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>{children}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          ref={contentRef}
          side="bottom"
          align="start"
          sideOffset={8}
          avoidCollisions={false}
          className="z-(--z-dropdown) max-h-[calc(50svh-2rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-[0_4px_8px_rgba(36,31,28,0.08),0_12px_32px_rgba(36,31,28,0.12)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
          aria-label={activePillar ? `${activePillar.name} directions` : "Content direction"}
        >
          {activePillar ? (
            <div key={activePillar.id} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-150">
              <MenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setActivePillarId(null);
                }}
              >
                <ChevronLeft aria-hidden className="size-4 text-ink-3" />
                <span>All pillars</span>
              </MenuItem>
              <DropdownMenuPrimitive.Label className="px-3 pb-1.5 pt-3 text-xs font-semibold text-ink-3">
                {activePillar.name}
              </DropdownMenuPrimitive.Label>
              {activePillar.directions.map((direction) => (
                <MenuItem
                  key={direction.id}
                  onSelect={() => choose({ pillarId: activePillar.id, directionId: direction.id })}
                >
                  <span className="min-w-0 flex-1 leading-snug">{direction.name}</span>
                  {selection.directionId === direction.id && <Check aria-hidden className="size-4 shrink-0 text-accent-press" />}
                </MenuItem>
              ))}
            </div>
          ) : (
            <div key="pillars" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-150">
              <DropdownMenuPrimitive.Label className="px-3 pb-1.5 pt-2 text-xs font-semibold text-ink-3">
                Content direction
              </DropdownMenuPrimitive.Label>
              <MenuItem onSelect={() => choose({ pillarId: "", directionId: "" })}>
                <Sparkles aria-hidden className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">Auto direction</span>
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-ink-3">Choose the best fit from your input</span>
                </span>
                {!selection.directionId && <Check aria-hidden className="size-4 shrink-0 text-accent-press" />}
              </MenuItem>
              <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />
              {pillars.map((pillar) => {
                const Icon = pillarIcon(pillar.slug);
                const selected = pillar.id === selection.pillarId;
                return (
                  <MenuItem
                    key={pillar.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      setActivePillarId(pillar.id);
                    }}
                  >
                    {/* The pillar holding the current direction is the only row
                        without a check of its own, so it still needs to be
                        distinguishable — full ink against the muted default
                        carries that without spending the accent. */}
                    <Icon aria-hidden className={`size-4 shrink-0 ${selected ? "text-ink" : "text-ink-3"}`} strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate leading-snug">{pillar.name}</span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
                  </MenuItem>
                );
              })}
            </div>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function MenuItem({ className = "", ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={`flex min-h-11 cursor-default select-none items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors data-highlighted:bg-sunken data-disabled:pointer-events-none data-disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
