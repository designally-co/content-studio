import type { CSSProperties } from "react";

/**
 * The Designally mark — the D. in its disc.
 *
 * The same object and the same artwork the team app uses (designally-platform
 * `src/app/mark.tsx`), so the two doors show one mark rather than two
 * treatments of a name. `DESIGNALLY.` set in caps is not an approved lockup and
 * was retired there on 19 August 2026; it is not reintroduced here.
 *
 * The geometry is the disc's own: 56% of the diameter. `size` is the diameter
 * and the only thing a caller sets — the mark inside scales from it.
 *
 * A plain `<img>`: two kilobytes with no layout shift to optimise away, on the
 * first paint of a page somebody is waiting at.
 */
export default function Mark({ size = 60 }: { size?: number }) {
  return (
    <span className="brandmark" style={{ "--brandmark-size": `${size}px` } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/designally-mark.png" alt="Designally" width={290} height={256} />
    </span>
  );
}

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
