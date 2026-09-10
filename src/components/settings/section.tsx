/**
 * A settings section — a heading, an optional line of context, and content.
 *
 * Deliberately not a Card. Every section being a bordered, shadowed box made
 * Settings read as an admin console: eight outlines competing for the same
 * attention, none of them meaning anything. Create sets the house style — a
 * recessed ground, one object, and air — so separation here comes from space
 * and type instead of from chrome. Surfaces are kept for things that genuinely
 * are objects: fields, and panels you act on.
 */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  /**
   * A PHRASE, NOT A SENTENCE, and roughly the length of its neighbours.
   *
   * These were nine sentences between 32 and 59 characters — "How the brand is
   * identified across the app.", "Which model runs the fast work, and which the
   * careful work." Stacked down one column they read as nine separate small
   * paragraphs, each asking to be finished before the heading below it could be
   * scanned, and the ragged right edge made the column look unconsidered before
   * a word of it was read.
   *
   * A settings deck is a label on a heading, not prose: it names what the
   * section holds and stops. Kept to 25-33 characters they form an even second
   * column that the eye can skip, which is what a deck is for — there when you
   * need it, silent when you do not.
   */
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-heading text-[length:var(--text-h2)] font-medium leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && (
            <p className="max-w-[62ch] text-sm leading-relaxed text-ink-3">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
