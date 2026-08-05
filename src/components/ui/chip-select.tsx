"use client";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";

export type ChipOption = { value: string; label: string; description?: string };

/**
 * A compact pill select whose menu renders through a portal.
 *
 * `MenuSelect` positions its list absolutely, which means any ancestor with
 * `overflow: hidden` clips it — and the composer surfaces are exactly that:
 * rounded plates that must clip their own content. Portalling escapes the
 * clipping ancestor entirely, which is why the content-direction picker on the
 * home surface is built this way too.
 */
export function ChipSelect({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  align = "start",
  side = "bottom",
  className = "",
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  options: ChipOption[];
  onChange: (value: string) => void;
  align?: "start" | "end";
  /**
   * Set explicitly rather than left to collision detection. A trigger inside a
   * bottom-anchored dock has no room beneath it, and a menu that decides which
   * way to open from available space flips as the page scrolls.
   */
  side?: "top" | "bottom";
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={`inline-flex min-h-9 max-w-52 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink-2 transition-colors duration-(--duration-fast) ease-(--ease-spring) hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] data-[state=open]:bg-sunken data-[state=open]:text-ink ${className}`}
      >
        <span className="truncate">{selected?.label ?? ariaLabel}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) ease-(--ease-spring) group-data-[state=open]:rotate-180" />
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-(--z-dropdown) max-h-[min(24rem,60svh)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-[var(--shadow-pop)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <DropdownMenuPrimitive.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex min-h-11 cursor-default select-none items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors data-highlighted:bg-sunken data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">{option.label}</span>
                {option.description && (
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-ink-3">{option.description}</span>
                )}
              </span>
              {value === option.value && <Check aria-hidden className="size-4 shrink-0 text-accent-press" />}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
