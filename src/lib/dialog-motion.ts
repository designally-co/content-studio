"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

import { MOTION, duration } from "./motion";

/* `useLayoutEffect` on the client, `useEffect` on the server — React warns
   about the former during SSR, and a panel's opening position has to be set
   BEFORE the browser paints or it flashes at its resting place for a frame on
   the way to sliding in. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Below this the modal is a bottom sheet; above it, a centred dialog. Read at
 *  animation time rather than kept in state: a rotation mid-gesture is rare,
 *  and a stale value here would send the panel off an edge it is not near. */
function isSheet(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

/**
 * How far below its resting place a sheet begins, IN PIXELS.
 *
 * NOT `yPercent: 100`, which says the same thing and is the obvious way to
 * write it. A percentage is resolved against the element's size on every tick,
 * and these panels load their content asynchronously — so a sheet that is 167px
 * tall when the tween starts and 747px tall two frames later has its offset
 * silently retargeted mid-flight. Measured: the entrance ran 78, 70, 57 and
 * then jumped to 197 as the settings data arrived.
 *
 * A pixel value is fixed when the tween is built and cannot be retargeted. The
 * panel is bottom-anchored, so its own height is exactly the distance that puts
 * it off-screen; if it grows during the entrance it grows upward, in place,
 * which is a change in size rather than a jump in position.
 */
function offscreen(panel: HTMLElement): number {
  return panel.offsetHeight || window.innerHeight;
}

/**
 * Presence and motion for a modal, in the two shapes this product has.
 *
 * WHY A HOOK AND NOT CSS. The entrance was never the hard part — the exit was.
 * Radix takes its content out of the tree the moment `open` goes false, so
 * there is nothing left to animate leaving, and the old `data-closed:` classes
 * only ever ran because tailwindcss-animate holds the node open for them. Once
 * motion moved to one module, having two systems decide how long a thing takes
 * — the module for the drawer, a utility class for everything else — is exactly
 * the drift the module exists to stop.
 *
 * So presence is held here: `mounted` outlives `open` by the length of the exit,
 * and the caller's `onExited` fires when the panel has actually gone.
 *
 * IT ANIMATES THE SHAPE THE MODAL IS IN. Below `lg` these are bottom sheets and
 * they travel from the bottom edge, the way the drawer travels from the left —
 * the direction says where the thing lives when it is not here. Above `lg` they
 * are centred dialogs with no edge to have come from, so they resolve in place
 * with a fade and a small scale. Sliding a centred dialog up from the floor
 * would be a claim about geography nothing on screen supports.
 */
export function useDialogMotion({
  open,
  onExited,
}: {
  open: boolean;
  /** Fires once the exit has finished and the panel is gone. */
  onExited: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  // Adjusted during render rather than in an effect — React's own answer for
  // state derived from other state.
  if (open && !mounted) setMounted(true);

  /* CALLBACK REFS INTO STATE, NOT `useRef`. Radix mounts `Dialog.Content`
     through a portal on a LATER commit than this hook's first one, so an
     effect keyed on mounting runs while the ref is still null — `gsap` is
     handed nothing, no-ops silently, and the panel simply appears at rest.
     That is what "the exit animates but the entrance does not" looks like from
     the outside, and it cost two rounds of measurement to see.
     
     Holding the nodes in state makes their arrival a dependency: the effect
     re-runs the moment they exist, which is the only moment it could ever have
     worked. */
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  /** Kept fresh without re-running the tween effect when the caller passes a
   *  new function identity on every render. */
  const exited = useRef(onExited);
  useEffect(() => {
    exited.current = onExited;
  }, [onExited]);

  useIsomorphicLayoutEffect(() => {
    if (!mounted || !panel) return;
    gsap.set(overlay, { autoAlpha: 0 });
    gsap.set(panel, isSheet() ? { y: offscreen(panel), autoAlpha: 1 } : { autoAlpha: 0, scale: 0.96 });
  }, [mounted, panel, overlay]);

  useEffect(() => {
    if (!mounted || !panel) return;
    const sheet = isSheet();
    const timeline = gsap.timeline();

    if (open) {
      const seconds = duration(MOTION.ENTER);
      /* `fromTo`, NOT `to` — the tween states where it begins rather than
         trusting something else to have put the panel there. The layout effect
         above sets the same values, and on this element it was not landing:
         Radix mounts `Dialog.Content` through a portal and a stack of
         wrappers, and the ref this hook holds is not populated by the time a
         layout effect keyed on mounting runs. The panel therefore started at
         rest and the entrance played out over zero distance — a fade with no
         arrival, which is exactly what it looked like.

         `fromTo` cannot have that problem: the start values are applied when
         the tween is built, on a ref that is populated by then. The layout
         effect stays as the belt to this braces — when it does land, it saves
         the single painted frame between mount and the first tween tick. */
      timeline.fromTo(
        overlay,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: seconds, ease: MOTION.EASE_ENTER },
        0,
      );
      timeline.fromTo(
        panel,
        sheet ? { y: offscreen(panel) } : { autoAlpha: 0, scale: 0.96 },
        sheet
          ? { y: 0, duration: seconds, ease: MOTION.EASE_ENTER }
          : { autoAlpha: 1, scale: 1, duration: seconds, ease: MOTION.EASE_ENTER },
        0,
      );
    } else {
      const seconds = duration(MOTION.EXIT);
      timeline.to(overlay, { autoAlpha: 0, duration: seconds, ease: MOTION.EASE_EXIT }, 0);
      timeline.to(
        panel,
        sheet
          /* Absolute, so a drag that has already moved the panel leaves from
             where it actually is rather than from where it would have been. */
          ? { y: offscreen(panel), duration: seconds, ease: MOTION.EASE_EXIT }
          : { autoAlpha: 0, scale: 0.96, duration: seconds, ease: MOTION.EASE_EXIT },
        0,
      );
      // The unmount rides the tween rather than a timer, so the markup goes
      // exactly when the panel has finished leaving. A zero duration under
      // reduced motion still fires it, which is why there is no second branch.
      timeline.eventCallback("onComplete", () => {
        setMounted(false);
        exited.current();
      });
    }

    return () => {
      timeline.kill();
    };
  }, [open, mounted, panel, overlay]);

  return { mounted, panel, setPanel, setOverlay };
}
