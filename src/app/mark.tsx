import type { CSSProperties } from "react";

/* The disc version (`Mark`) is gone with the old sign-in page, the one place it
   stood; the flat mark below is the only mark the product draws now. */

/**
 * The mark with no disc under it — the D in ink, the full stop in the accent.
 *
 * The chrome version, and the platform's own reasoning applies here unchanged:
 * on a rail whose other controls are small and quiet, a disc filled solid
 * orange is the heaviest thing on the screen, and it is fuller than its
 * neighbours besides — the mark takes 56% of its disc where an icon takes 45%.
 *
 * It is the same artwork, not a second asset. `designally-mark.png` is a white
 * D. on transparency, so it cannot simply be recoloured — but it splits: the
 * drawing holds exactly two runs of ink with a gap between them at 73.79% of
 * the width. Two layers masked by the same file and clipped either side of
 * that gap give each its own colour, and the drawing stays the drawing.
 *
 * `Mark` keeps the disc and is still right where it stands alone with nothing
 * to be heavy beside — the sign-in page.
 */
export function FlatMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="dmark shrink-0"
      style={{ "--dmark-w": `${size}px` } as CSSProperties}
      role="img"
      aria-label="Designally"
    >
      <i className="dm-d" />
      <i className="dm-dot" />
    </span>
  );
}
