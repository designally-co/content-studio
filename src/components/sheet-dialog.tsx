"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";

import gsap from "gsap";

import { useDialogMotion } from "@/lib/dialog-motion";
import { MOTION, duration } from "@/lib/motion";
import { claimSheet, registerSheet, releaseSheet } from "./sheet-stack";

/**
 * A modal that is a bottom sheet on a phone and a centred dialog from `lg`.
 *
 * WRITTEN ONCE BECAUSE THERE ARE TWO OF THEM AND THEY WERE DIVERGING ALREADY.
 * Settings and the routine editor are the same object — same palette, same
 * 92svh ceiling, same 46rem measure — and each carried its own copy of it,
 * including two identical `SHEET` palettes whose comments each claimed to be
 * "matching the other exactly". That is the state a thing is in just before it
 * stops matching.
 *
 * What the shell owns: the portal, the scrim, the geometry at both widths, the
 * drag handle and its gesture, the scrolling column, and the one-sheet-at-a-time
 * registration. What a caller owns: its title, its close button and its
 * content — the things that actually differ.
 */

/**
 * THE SHEET CARRIES ITS OWN PALETTE. It sits above the app rather than in it,
 * and a modal that inherits the page's tokens picks up whatever the page
 * happens to be doing — a field on a grey ground reading as disabled here
 * because the ground behind it is the colour a disabled field uses there.
 */
export const SHEET = {
  "--sheet-bg": "#f8f8f7",
  "--sheet-field": "#f0f0ef",
  "--sheet-plate": "#ffffff",
  "--sheet-line": "#f0f0f0",
  "--sheet-placeholder": "#a6a6a6",
  "--sheet-ink": "#1a1a1a",
  "--sheet-ink-2": "#737373",
  /* The brand orange itself. The global focus ring is `--orange-200`, a wash
     that reads as a smudge around a field rather than as a ring somebody
     drew; at the real value the focus is unmistakably where you are. */
  "--sheet-ring": "#ef6148",
} as React.CSSProperties;

/** How far the sheet has to be pulled before letting go dismisses it. Below
 *  this a drag springs back, so a thumb that slips while reaching for the
 *  content does not close a form somebody was filling in. */
const SHEET_DISMISS = 96;

export function SheetDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  /* CLOSING IS A REQUEST, NOT THE EVENT. The caller unmounts this component
     when `onClose` fires, so calling it the moment somebody presses X would
     take the panel out of the tree with nothing left to animate leaving.
     `wants` is the ask; the hook plays the exit and reports back when the
     panel has actually gone, and only then does the caller hear about it.

     Every way out lands here: Radix routes Escape, the scrim and the caller's
     own `Dialog.Close` through `onOpenChange`, and the drag calls it directly. */
  const [wants, setWants] = useState(true);
  const { mounted, panel, setPanel, setOverlay } = useDialogMotion({
    open: wants,
    onExited: onClose,
  });
  /* ONE SHEET AT A TIME. This mounts only while it is open, so claiming on
     mount is the whole of it — whatever stage sheet was holding the bottom of
     the screen closes as this one arrives. `onClose` goes through a ref so a
     new function identity each render does not re-claim the floor. */
  const sheetId = useId();
  const close = useRef(onClose);
  // In an effect, not during render: a ref written while rendering is a value
  // React has not agreed to yet.
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const unregister = registerSheet(sheetId, () => close.current());
    claimSheet(sheetId);
    return () => {
      releaseSheet(sheetId);
      unregister();
    };
  }, [sheetId]);

  /* PULL DOWN TO DISMISS, the gesture the stage sheets already answer to. A
     handle that cannot be dragged is a lie about what the surface does, so the
     bar and the behaviour arrive together or not at all. Down only: this sheet
     has one open height, unlike the stage sheets, which have a closed ledge to
     travel back to. */
  const [drag, setDrag] = useState<number | null>(null);
  const startY = useRef(0);
  /** Which pointer owns the gesture, so a second finger cannot hijack it. */
  const pointer = useRef<number | null>(null);

  if (!mounted) return null;

  return (
    <Dialog.Root open onOpenChange={(next) => !next && setWants(false)}>
      <Dialog.Portal>
        {/* The scrim's fade is tweened with the panel rather than declared as a
            utility, so the two cannot end at different times — which is what a
            modal looks like when it is wrong. */}
        <Dialog.Overlay ref={setOverlay} className="fixed inset-0 z-(--z-backdrop) bg-ink/25" />
        {/* CENTRED BY A GRID, NOT BY A TRANSLATE. The desktop panel used to
            sit at top-1/2 left-1/2 with a -50% translate on the `translate`
            property — and GSAP, which animates the panel's `transform` for the
            entrance and the drag, folds that property into its own transform
            the first time it touches the element, baking the percentage into
            pixels from whatever height the panel had at that instant. The
            panel is measured before its content has settled, so the baked
            offset was a fraction of the real one and the sheet hung well
            below centre, growing downward off the screen. A grid cell centres
            by layout, which GSAP never reads. The frame is inert to the
            pointer so the scrim beneath still takes the click that closes. */}
        <div className="pointer-events-none fixed inset-0 z-(--z-modal) lg:grid lg:place-items-center">
        <Dialog.Content
          ref={setPanel}
          /* The sheet's palette, plus wherever the drag has pushed it to. One
             `style`, because two on the same element is not a merge — the
             second silently replaces the first, and the sheet would lose its
             own colours the moment a thumb touched the handle. */
          /* Palette only. The drag used to write its own `transform` here,
             which is the property GSAP animates — so the two took turns owning
             the panel's position, and letting go cleared the inline style and
             snapped the sheet home with no motion at all. The gesture moves it
             through GSAP now, so releasing is a tween like everything else. */
          style={SHEET}
          /* A BOTTOM SHEET ON A PHONE, a centred dialog from `lg`. Shrinking
             the desktop panel instead spent 32px of a 375px screen on margins
             around a form whose fields then had to fit what was left, started
             it well down the display so the controls furthest from the thumb
             were the ones reached for first, and made it the only modal in the
             app that did not arrive from the edge nearest your hand.

             THE FRAME DOES NOT SCROLL; THE COLUMN INSIDE IT DOES, so the
             handle stays put while the content moves under it. */
          className="pointer-events-auto fixed inset-x-0 bottom-0 flex max-h-[92svh] flex-col overflow-hidden rounded-t-(--radius-sheet) bg-(--sheet-bg) shadow-[var(--shadow-pop)] outline-none lg:static lg:inset-auto lg:w-[min(46rem,calc(100vw-2rem))] lg:rounded-2xl"
          aria-describedby={undefined}
        >
          {/* THE HANDLE, ON ITS OWN CENTRED ROW — the same bar, in the same
              place, doing the same thing as on a stage sheet. It is the row
              that drags rather than the header below it, because the header
              lives inside the scroller and a gesture that both scrolls and
              drags is one that does neither reliably.

              Hidden above `lg`, where the sheet is a centred dialog with no
              edge to be pulled towards. */}
          <div
            onPointerDown={(event) => {
              startY.current = event.clientY;
              pointer.current = event.pointerId;
            }}
            onPointerMove={(event) => {
              if (pointer.current !== event.pointerId) return;
              // Down only — dragging up would lift the sheet off the bottom
              // edge it is anchored to, leaving a strip of page beneath it.
              const delta = Math.max(0, event.clientY - startY.current);
              // Capture once this is unmistakably a drag, not a tap that moved.
              if (drag === null && delta < 4) return;
              if (drag === null) event.currentTarget.setPointerCapture(event.pointerId);
              setDrag(delta);
              // Directly, not tweened: the sheet has to track the thumb frame
              // for frame, and easing towards a moving target lags behind it.
              gsap.set(panel, { y: delta });
            }}
            onPointerUp={(event) => {
              pointer.current = null;
              if (drag === null) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              const delta = event.clientY - startY.current;
              setDrag(null);
              if (delta > SHEET_DISMISS) {
                setWants(false);
                return;
              }
              // Short of the threshold it goes back, and it EASES back: a
              // sheet that snaps home the instant a thumb lifts reads as a
              // rejection rather than as the gesture not having been enough.
              gsap.to(panel, {
                y: 0,
                duration: duration(MOTION.EXIT),
                ease: MOTION.EASE_ENTER,
              });
            }}
            onPointerCancel={() => {
              pointer.current = null;
              setDrag(null);
            }}
            className="shrink-0 touch-none select-none pb-1 pt-3 lg:hidden"
          >
            <div className="flex justify-center">
              <span aria-hidden className="h-1 w-9 rounded-full bg-line-strong" />
            </div>
          </div>

          {/* `pb` beyond the gutter, because the sheet's foot is the bottom of
              the screen: without it the last control sits against the edge with
              no room to scroll past, and on a phone that edge is where the home
              indicator is. */}
          <div className="cs-sheet-scroll min-h-0 flex-1 overflow-y-auto p-5 pb-10 pt-2 sm:p-7 lg:pb-7">
            {children}
          </div>
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
