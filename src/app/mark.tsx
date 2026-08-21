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
