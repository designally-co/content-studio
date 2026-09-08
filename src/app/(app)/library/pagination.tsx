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
  page,
  pageCount,
  total,
  from,
  to,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  /** Prebuilt on the server, so the other filters survive the move. */
  hrefFor: { previous: string | null; next: string | null };
}) {
  if (pageCount <= 1) return null;

  const step =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink transition-colors duration-(--duration-fast) hover:bg-sunken focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px]";
  const spent = `${step} pointer-events-none opacity-40`;

  return (
    <nav
      aria-label="Library pages"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-ink-3">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {hrefFor.previous ? (
          <Link href={hrefFor.previous} className={step} rel="prev">
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </Link>
        ) : (
          /* Rendered rather than hidden, so the pair does not shift sideways
             on the first and last page. */
          <span className={spent} aria-hidden>
            <ChevronLeft className="size-4" />
            Previous
          </span>
        )}
        <span className="px-1 text-sm text-ink-3">
          {page} / {pageCount}
        </span>
        {hrefFor.next ? (
          <Link href={hrefFor.next} className={step} rel="next">
            Next
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className={spent} aria-hidden>
            Next
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
