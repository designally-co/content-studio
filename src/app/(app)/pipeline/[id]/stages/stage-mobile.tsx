"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

import { MOTION, duration } from "@/lib/motion";
import { X } from "lucide-react";

import { PAGE_ACTION_BUTTON, PAGE_CLOSE_BUTTON } from "@/components/page-bar";
import { claimSheet, registerSheet, releaseSheet } from "@/components/sheet-stack";

/**
 * The action rail, on a phone.
 *
 * On a desktop each stage is a column of work with a rail of panels beside it:
 * the forward action on top, the stage's own tool underneath. A phone has no
 * room for a second column, so the rail stacked BELOW the article — which put
 * the button that leaves the stage at the bottom of a four-thousand-pixel
 * scroll, and the revise tools below that.
 *
 * Two surfaces take its place, and between them they cost no vertical space at
 * all. The forward action becomes one button in the corner of the screen, on
 * the line the menu button and the stepper already occupy. The stage's tool
 * becomes a sheet on the floor of the screen that is pulled up when wanted.
 */

/**
 * How much of the sheet stays on screen when it is closed.
 *
 * The header's own height, measured: 12px above the handle, the 4px bar, then
 * the title row. It was 56 while the handle sat inline with the title, and
 * moving the handle to its own row above pushed the title's descenders below
 * the fold — the sheet read as clipped rather than as resting.
 */
/* `useLayoutEffect` on the client, `useEffect` on the server — the sheet's
   closed position has to be set before the browser paints, or it shows fully
   open for a frame on its way down to the ledge. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const PEEK = 70;

/** Past this much drag, let go and it goes the rest of the way. */
const THRESHOLD = 48;

/**
 * The forward action, as one button in the top-right corner.
 *
 * It sits in the same 48px band as the menu button opposite it, so the top of a
 * phone reads as one row — menu, progress, action — rather than as chrome with
 * a floating button dropped on top of it.
 *
 * `fixed`, not `sticky`: it belongs to the screen rather than to the column it
 * came from, and the stage it acts on scrolls underneath it.
 */
/**
 * The corner slot and the disc that sits in it, published separately.
 *
 * The publish stage's action is not a button but a menu trigger — one press has
 * to ask whether the article is going live or saving as a draft — and Radix
 * needs to own that element. Sharing the classes rather than the component is
 * what keeps the two looking like the same control.
 */
export const STAGE_ACTION_SLOT =
  "fixed right-3 top-0 z-(--z-nav) flex h-12 items-center lg:hidden";

/* The two disc treatments live in @/components/page-bar now, because Library
   and Routines put the same buttons on the same line as this one. Re-exported
   under their old names so the stages importing them from here still can. */
export { PAGE_ACTION_BUTTON as STAGE_ACTION_BUTTON, PAGE_CLOSE_BUTTON as STAGE_CLOSE_BUTTON };

export function StageAction({
  label,
  onClick,
  disabled,
  children,
}: {
  /** Named, because the button itself is only a glyph. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={STAGE_ACTION_SLOT}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        /* Filled, unlike the menu button's outline: this is the one thing on
           the screen you are being invited to press, and the pair of discs
           either side of the stepper should not read as two of a kind. */
        className={PAGE_ACTION_BUTTON}
      >
        {children}
      </button>
    </div>
  );
}

/**
 * The stage's own tool, as a sheet that pulls up from the floor.
 *
 * Closed it shows a handle and its name, which is enough to say what is down
 * there. Open it takes most of the screen and scrolls inside itself.
 *
 * DRAGGED OR TAPPED, because both are things people do to a handle like this
 * one. The drag is written on pointer events rather than touch events so it
 * works from a trackpad too, and the element captures the pointer so a fast
 * flick that leaves the handle still finishes the gesture.
 */
export function StageSheet({
  title,
  subtitle,
  flush,
  onOpenChange,
  children,
}: {
  title: string;
  subtitle?: string;
  /**
   * Told when the sheet opens or closes.
   *
   * The images stage does not scroll — it is a title, a picture and a dock
   * sized to the screen — so when the sheet rises there is nowhere for the
   * content to go unless it is moved. It lifts instead of being covered.
   *
   * Reports the DISTANCE the sheet travelled, not merely that it opened: how
   * far the content has to move is exactly how far the sheet rose, and that
   * depends on what is in it. A tuned constant clears a sheet holding two
   * thumbnails and hides the dock behind one holding six.
   */
  onOpenChange?: (lift: number) => void;
  /**
   * The content brings its own horizontal padding.
   *
   * Panels in the desktop rail pad each block individually so their dividers
   * can run edge to edge; padding them again here would inset those rules and
   * make the sheet look like a different component holding the same controls.
   */
  flush?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  /* ONE SHEET AT A TIME. The settings sheet arrives from this same edge and
     knows nothing about this one; without the registry both sat on the bottom
     of the screen at once. See @/components/sheet-stack. */
  const sheetId = useId();
  useEffect(() => registerSheet(sheetId, () => setOpen(false)), [sheetId]);
  useEffect(() => {
    if (!open) return;
    claimSheet(sheetId);
    return () => releaseSheet(sheetId);
  }, [open, sheetId]);
  const startY = useRef(0);
  /** Which pointer owns the gesture, so a second finger cannot hijack it. */
  const pointer = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const finish = useCallback(
    (delta: number) => {
      setDrag(null);
      // Down closes, up opens, and only past the threshold — otherwise a stray
      // pixel of movement while tapping would toggle it.
      if (delta > THRESHOLD) setOpen(false);
      else if (delta < -THRESHOLD) setOpen(true);
    },
    []
  );

  /* Reported from an effect rather than from each of the four things that can
     change it — the toggle, a drag, the scrim, Escape. One place to be wrong
     instead of four. */
  useEffect(() => {
    const height = panel.current?.getBoundingClientRect().height ?? 0;
    onOpenChange?.(open ? Math.max(0, height - PEEK) : 0);
  }, [open, onOpenChange, children]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  /* Clamped so the sheet cannot be dragged off the top of its own travel or
     pushed below its closed position — either would leave it somewhere it has
     no way of animating back from. */
  const offset =
    drag === null
      ? undefined
      : open
        ? Math.max(0, drag)
        : Math.min(0, drag);

  /* THE POSITION IS ONE EXPRESSION, IN TWO UNITS. Open, the panel rests at 0;
     closed, it rests at its own height less the peek — which is `yPercent: 100`
     and `y: -PEEK` together, the same thing the old `calc(100% - 70px)` said
     and just as self-adjusting when the content changes height. */
  const restingY = open ? { yPercent: 0, y: 0 } : { yPercent: 100, y: -PEEK };

  /* Off-screen but for its ledge before the first paint, so the sheet does not
     appear fully open and then drop into place. */
  useIsomorphicLayoutEffect(() => {
    gsap.set(panel.current, { yPercent: 100, y: -PEEK });
  }, []);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    // Under the thumb it tracks directly: easing towards a moving target lags
    // behind it, which reads as the sheet being heavy rather than held.
    if (drag !== null) {
      gsap.set(node, { ...restingY, y: restingY.y + (offset ?? 0) });
      return;
    }
    const tween = gsap.to(node, {
      ...restingY,
      duration: duration(open ? MOTION.ENTER : MOTION.EXIT),
      ease: open ? MOTION.EASE_ENTER : MOTION.EASE_EXIT,
    });
    return () => {
      tween.kill();
    };
    // `restingY` is derived from `open` on every render; depending on the
    // object would restart the tween each pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drag, offset]);

  return (
    <>
      {/* The way out, and the thing that says the sheet is modal-ish while it
          is open. Not rendered closed, so the page below stays usable. */}
      {open && (
        /* NOT A BUTTON, AND NOT NAMED. It was `<button aria-label="Close X">`,
           which put a second control with the identical accessible name on the
           screen — a 375x812 one — beside the X in the header. A screen reader
           offering "Close Revise" twice cannot say which is which, and the
           whole-screen one is the one nobody meant to reach.
           Tapping outside still closes. The ways out that are ANNOUNCED are the
           X and the Escape key, which is the pair every dialog offers. */
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-(--z-sticky) bg-ink/20 lg:hidden motion-safe:animate-in motion-safe:fade-in-0"
        />
      )}

      <div
        ref={panel}
        /* No rule along the top. The shadow already lifts it off the page, and a
           hairline as well is the same mistake the dropdown panels make when
           they carry one — a floating layer drawn as a boxed one. */
        /* `--radius-sheet`, shared with the settings sheet — the two are the
           same object and were rounded by two classes that merely agreed. */
        className="fixed inset-x-0 bottom-0 z-(--z-nav) flex max-h-[85svh] flex-col rounded-t-(--radius-sheet) bg-surface shadow-[var(--shadow-pop)] lg:hidden"

      >
        {/* THE HANDLE IS ITS OWN ROW, CENTRED. It sat inline before the title
            like a bullet, which is where a decoration goes and not where a
            handle goes — every sheet anybody has used puts the bar in the
            middle of the top edge, and that convention is doing the explaining.

            The whole header still drags, title and all: a 4px bar is the right
            SIGN for the gesture and much too small a target for it. */}
        <div
          onPointerDown={(event) => {
            startY.current = event.clientY;
            pointer.current = event.pointerId;
          }}
          onPointerMove={(event) => {
            if (pointer.current !== event.pointerId) return;
            const delta = event.clientY - startY.current;
            // Capture only once this is unmistakably a drag. Grabbing the
            // pointer on contact would swallow the click on the close button
            // sitting inside this same surface.
            if (drag === null && Math.abs(delta) < 4) return;
            if (drag === null) event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(delta);
          }}
          onPointerUp={(event) => {
            pointer.current = null;
            if (drag === null) return;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finish(event.clientY - startY.current);
          }}
          onPointerCancel={() => {
            pointer.current = null;
            setDrag(null);
          }}
          className="shrink-0 touch-none select-none"
        >
          <div className="flex justify-center pb-1 pt-3">
            <span aria-hidden className="h-1 w-9 rounded-full bg-line-strong" />
          </div>

          <div className="flex items-start gap-2 px-5">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => drag === null && setOpen((v) => !v)}
              className="min-w-0 flex-1 truncate pb-0.5 pt-2 text-left font-heading text-[length:var(--text-h3)] font-medium tracking-tight text-ink"
            >
              {title}
            </button>
            {/* Only once there is something to close. At rest the sheet is a
                title on a ledge, and an X beside it would be offering to
                dismiss something that is not open. */}
            {open && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={`Close ${title}`}
                /* No negative right margin: the corner radius is derived from
                   this disc's distance to the sheet's edge, so pulling it 4px
                   further out would leave the two curves disagreeing. */
                className={`-mt-0.5 ${PAGE_CLOSE_BUTTON}`}
              >
                <X aria-hidden className="size-5" />
              </button>
            )}
          </div>
        </div>

        {/* PROXIMITY. The subline belongs to the heading above it, not to the
            content below — it was 12px from its own title and 4px from the
            first control, so it read as a caption on the wrong thing. Two
            pixels up, sixteen down. */}
        {subtitle && (
          /* MEASURED, NOT FULL BLEED. A deck running the whole width of the
             sheet sets a line the eye has to track all the way back from, for
             one sentence — and it put the last word under the close button.
             Capped at a comfortable measure it stays a caption on the title
             rather than a paragraph in its own right. */
          <p className="max-w-[34ch] shrink-0 px-5 pt-0.5 text-sm leading-relaxed text-ink-2">
            {subtitle}
          </p>
        )}
        {/* NO BAR DRAWN OVER THE SHEET. A scrollbar tracked down the inside of
            the right edge, across the rounded corner the sheet just gained, on
            a surface whose whole interaction is a thumb — the same call the
            settings sheet already made. It still scrolls. */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto pb-6 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${flush ? "" : "px-5"}`}
          aria-hidden={!open}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * How much room the closed sheet takes, for the page to keep clear of.
 *
 * The sheet is fixed, so it does not push anything: without this the last of
 * the article — or the image dock, which lives at the foot of its own plate —
 * would sit permanently underneath it.
 */
export const SHEET_CLEARANCE = "pb-20 lg:pb-0";
