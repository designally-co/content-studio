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
          <h2 className="font-heading text-[length:var(--text-h2)] font-bold leading-tight tracking-[-0.01em] text-ink">
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

/**
 * The surface a section's content sits on.
 *
 * Removing the cards left every field floating directly on the recessed
 * ground, which read as unfinished rather than minimal — a scatter of outlined
 * inputs on a beige field with nothing holding them. The heading stays on the
 * ground and the content gets a plate, which is the same figure/ground relation
 * the Library cards use: no border, no resting shadow, just a lighter surface.
 */
export function Plate({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface p-5 sm:p-6 ${className}`}>{children}</div>
  );
}
