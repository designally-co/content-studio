/**
 * The heading a page opens with.
 *
 * ONE COMPONENT BECAUSE THEY WERE ALREADY ALMOST THE SAME, and "almost" is the
 * problem: Library grew to the hero size at `sm` and Routines did not, one had
 * a 12px gap under the title and the other 4px, and the two tracking values
 * were written differently while computing to nearly the same thing. Nobody
 * decided any of that — it is what happens when a heading is typed out twice.
 *
 * IT IS CONTENT, NOT CHROME. No band, no rule beneath it, nothing sticky: it
 * scrolls away with the page like the first line of a document, which is what
 * it is. A header pinned across the top of a screen is for something you need
 * while you work, and a page title is not that.
 *
 * `actions` sits on the title's own line, right-aligned. A page with nothing to
 * put there passes nothing and the row collapses to the heading alone.
 */
export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    /* BOTTOM ALIGNED, NOT TOP. The heading block is two lines and the controls
       beside it are one, so aligning their tops left the buttons floating level
       with the title while the deck ran on underneath them — two things on one
       row that did not look like a row. Sitting them on a common baseline is
       what makes the header read as a single line of the page. */
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-heading text-[length:var(--text-h1)] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[length:var(--text-hero)]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-3 sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
