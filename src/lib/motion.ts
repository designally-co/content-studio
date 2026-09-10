/**
 * The product's motion, in one place.
 *
 * WHY THESE NUMBERS AND NOT OTHERS. A surface that arrives should take longer
 * than one that leaves: arriving is information — you are watching where a
 * thing came from, which is what tells you where it will go back to — and
 * leaving is an acknowledgement, where every extra frame is the interface
 * making you wait to be finished with it. So `ENTER` is the slower of the two
 * and `EXIT` is roughly two thirds of it.
 *
 * THE EASES ARE ASYMMETRIC FOR THE SAME REASON. Something entering decelerates
 * into place (`power3.out`): almost all of the distance is covered early, so
 * the eye reads the destination immediately and the last few pixels only settle
 * it. Something leaving accelerates away (`power2.in`), because a panel that
 * eases gently out of existence looks like it is being dragged off rather than
 * dismissed. Both are the shape real objects have; neither is `linear`, which
 * is the shape nothing has.
 *
 * IT IS A MODULE, NOT A SET OF LITERALS AT EACH CALL SITE. Motion is the one
 * thing in an interface a reader experiences as a single system — two panels
 * that slide at different speeds read as two different products — and the only
 * way that holds is if there is one place to change it.
 */
export const MOTION = {
  /** A surface arriving: the drawer opening, a sheet rising. */
  ENTER: 0.42,
  /** The same surface leaving. */
  EXIT: 0.26,
  /** Content settling inside a surface that has already arrived. */
  CONTENT: 0.3,
  /** Between items in a list that arrives together. Small enough to read as
   *  one movement with a grain to it, rather than as items queueing. */
  STAGGER: 0.035,
  EASE_ENTER: "power3.out",
  EASE_EXIT: "power2.in",
} as const;

/**
 * Whether this reader has asked the system for less movement.
 *
 * READ AT THE MOMENT OF ANIMATING, not once at module load. The setting can
 * change while the app is open — it is a system toggle, not a build flag — and
 * a value captured at import would keep animating for the rest of the session
 * after somebody turned it off because something was making them ill.
 *
 * Guarded for the server, where there is no `matchMedia` and no motion either.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A duration, or none at all.
 *
 * REDUCED MOTION MEANS NO TRAVEL, NOT A FASTER TRAVEL. Halving a slide still
 * slides; the setting is asked for by people for whom the movement itself is
 * the problem. Zero keeps every tween's `onComplete` — the callbacks that
 * unmount panels and release state — so the code path is identical and there is
 * no second, untested branch where a drawer never unmounts.
 */
export function duration(seconds: number): number {
  return prefersReducedMotion() ? 0 : seconds;
}
