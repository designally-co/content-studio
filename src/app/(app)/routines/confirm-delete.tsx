"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Deleting a routine, asked properly.
 *
 * IT WAS AN INLINE PANEL INSIDE THE CARD, which put a destructive button in
 * the same few hundred pixels as the menu that opens it — one stray click from
 * the trigger and the confirmation is already under the cursor. A confirmation
 * that appears where the pointer already is confirms nothing. Two of these
 * disappeared during review without anybody meaning to delete them.
 *
 * So it takes the screen: focus moves into it, Escape and the overlay cancel,
 * and Delete is somewhere the pointer has to travel to.
 *
 * THE BODY NAMES THE CONSEQUENCE, not the action. "Are you sure" asks the
 * reader to supply the stakes themselves; the one thing worth knowing here is
 * that the articles survive and only the schedule goes.
 */

const SHEET = {
  "--sheet-bg": "#f8f8f7",
  "--sheet-ink": "#1a1a1a",
  "--sheet-ink-2": "#737373",
} as React.CSSProperties;

export function ConfirmDelete({
  name,
  open,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-backdrop) bg-ink/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          style={SHEET}
          className="fixed left-1/2 top-1/2 z-(--z-modal) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-(--sheet-bg) p-5 shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-heading text-[length:var(--text-h2)] font-semibold tracking-tight text-(--sheet-ink)">
              Delete this routine?
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-(--sheet-ink-2) transition-colors duration-(--duration-fast) hover:bg-black/5 hover:text-(--sheet-ink) focus-visible:outline-none focus-visible:[outline:2px_solid_#ef6148] focus-visible:[outline-offset:2px]"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm leading-relaxed text-(--sheet-ink-2)">
            <span className="font-medium text-(--sheet-ink)">{name}</span> stops running. The
            articles it already wrote stay in the Library — only the schedule goes.
          </Dialog.Description>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm}>
              Delete
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
