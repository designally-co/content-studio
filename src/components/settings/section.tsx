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
