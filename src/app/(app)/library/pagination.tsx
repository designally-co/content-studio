import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Which slice of the library you are looking at, and how to move.
 *
 * IT STATES THE RANGE, NOT JUST THE PAGE. "Page 2 of 4" tells you where you
 * are in a sequence nobody can picture; "21–40 of 73" tells you how much there
 * is and how much of it is in front of you, which is the question being asked.
 *
 * PLAIN LINKS, so a page is a real address: it survives a reload, can be
 * bookmarked, and the back button steps through pages the way it should. A
 * click handler would look identical and lose all three.
 *
 * The whole bar is absent on a single page — a control that can only be
 * disabled is furniture.
 */
export function Pagination({
  pageCount,
  total,
  from,
  to,
  hrefFor,
}: {
  /* `page` still arrives with the rest and is deliberately unread: the range
     below states where you are, and the guard below only needs the count. */
  page?: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  /** Prebuilt on the server, so the other filters survive the move. */
  hrefFor: { previous: string | null; next: string | null };
}) {
  if (pageCount <= 1) return null;

  /* TWO ARROWS, NO WORDS. "Previous" and "Next" beside arrows pointing the way
     they already point is the label saying what the glyph says; the pair took
     most of the width of a phone to carry four characters of meaning. The
     names live in `aria-label`, so nothing is lost to anyone who cannot see
     the arrow.

     NO EDGE OF THEIR OWN, either: the pill they sit in is the surface, and a
     bordered white disc on a bordered white pill is two outlines a few pixels
     apart drawing the same shape. They are targets on that surface, marked on
     touch by the ground going grey under them. */
  const step =
    "grid size-9 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:-2px]";
  const spent = `${step} pointer-events-none opacity-40`;

  return (
    <nav
      aria-label="Library pages"
      /* A PILL, LIKE EVERYTHING ELSE IT SITS UNDER. The paging line was loose
         type and two floating buttons on the page ground — the one part of the
         screen that was not on a surface, under a stack of cards that all are.
         Enclosing it makes it one object: the range and the way to move it,
         rather than a sentence that happens to have arrows near it.

         `pr-1` against `pl-4`, because an arrow is a 36px target with its glyph
         in the middle and the range is type that starts where its first letter
         does. Equal padding would have left the right arrow looking pushed in.
         No wrapping: the pill is one line by construction. */
      className="mt-4 flex items-center justify-between gap-3 rounded-full border border-line bg-surface py-1 pl-4 pr-1"
    >
      <p className="text-sm text-ink-3">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        {hrefFor.previous ? (
          <Link href={hrefFor.previous} className={step} rel="prev" aria-label="Previous page">
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        ) : (
          /* Rendered rather than hidden, so the pair does not shift sideways
             on the first and last page. */
          <span className={spent} aria-hidden>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {/* NO "1 / 2". It sat between the two arrows restating the half of the
            range that the line to its left already carries — "1–10 of 73" says
            both how far in you are and how much there is, in the terms the
            reader actually asked in. Two ways of counting the same list, a
            hand's width apart. */}
        {hrefFor.next ? (
          <Link href={hrefFor.next} className={step} rel="next" aria-label="Next page">
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className={spent} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
