/**
 * The band across the top of a phone screen, and the two disc buttons that
 * live on it.
 *
 * WRITTEN ONCE BECAUSE IT WAS ABOUT TO BE WRITTEN THREE TIMES. The pipeline
 * built this first — a three-layer progressive blur under a row that shares its
 * line with the menu button — and Library and Routines both needed the same
 * thing. Three copies of a stack whose whole effect depends on three masks
 * agreeing with each other is three chances for them to stop agreeing.
 */

/** The disc for a page's forward action: the thing you came here to press. */
export const PAGE_ACTION_BUTTON =
  "grid size-10 place-items-center rounded-full bg-accent text-white shadow-[var(--shadow-card)] transition-colors duration-(--duration-fast) ease-(--ease-out) enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-chrome-active disabled:text-ink-3 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";

/*  NO SIZE IN HERE. The sheet's close is 36 and the drawer's is 44, and
 *  stating a size in the constant meant each call site that wanted the other
 *  one put a second `size-*` on the same element — two utilities of equal
 *  specificity, so which of them wins is decided by the order Tailwind emits
 *  them in, not the order they are written. The caller owns the size. */
export const PAGE_CLOSE_BUTTON =
  "grid shrink-0 place-items-center rounded-full bg-chrome text-ink-2 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-chrome-active hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";

/**
 * PROGRESSIVE BLUR, NOT A LID. An opaque band the width of the page does not
 * let the content pass under the bar so much as chop it off, and reads as a
 * second surface floating over the page rather than as part of it.
 *
 * Three stacked layers, each blurring harder and stopping sooner: at the top
 * all three apply, a third of the way down only the softest still does, and by
 * the bottom edge there is none. That gradient is what makes it read as depth —
 * the text is visibly still there, going out of focus as it slides underneath,
 * instead of vanishing at a hard line.
 *
 * Blur alone would leave the type legible enough to compete with whatever the
 * bar carries, so each layer brings a wash of the page's own ground with it.
 * `-z-10` keeps the stack behind the bar's content while staying inside the
 * bar's own stacking context.
 */
export function TopBlur() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+1.25rem)]"
    >
      <div className="absolute inset-0 bg-bg/35 backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,#000_0,#000_62%,transparent_100%)]" />
      <div className="absolute inset-0 bg-bg/35 backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,#000_0,#000_38%,transparent_74%)]" />
      <div className="absolute inset-0 bg-bg/35 backdrop-blur-[16px] [mask-image:linear-gradient(to_bottom,#000_0,#000_16%,transparent_46%)]" />
    </div>
  );
}

/**
 * A page's title bar on a phone: the name of the page on the menu button's own
 * line, and the page's one action at the far end of it.
 *
 * FIXED, NOT STICKY WITH A NEGATIVE MARGIN. The pipeline pulls its bar up onto
 * the menu button's line with `-mt-12`, which works because that bar is the
 * first thing in the page. Routines' action has to open a dialog owned by a
 * client component several levels in, and a bar that has to be the first child
 * of the page cannot go there. Fixed puts it on that line from anywhere in the
 * tree — the 48px the menu strip already reserves in the flow is exactly what
 * this covers, so nothing below it moves.
 *
 * Below `lg` only: on a wide screen the rail is a sidebar, there is no menu
 * button and no line to share, and the page opens with its full heading.
 */
export function PageBar({
  title,
  action,
}: {
  title: string;
  /** The page's forward action, as a disc. Right-aligned on the bar's line. */
  action?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-(--z-sticky) lg:hidden">
      <TopBlur />
      {/* `pl-14` is the menu button's 44px disc plus the 12px gutter it sits
          in, so the title starts where the button ends rather than underneath
          it. The button belongs to the navigation and paints a layer above
          this, which is why the space for it is reserved rather than shared. */}
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-3 pl-14 sm:px-8 sm:pl-[4.5rem]">
        {/* The page's h1 — the only one it has below `lg`, since the heading
            block it used to open with is a desktop idea. Truncated rather than
            wrapped: the bar is one line tall and a second one would push it
            off the button's line. */}
        <h1 className="min-w-0 truncate font-heading text-base font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
    </div>
  );
}
