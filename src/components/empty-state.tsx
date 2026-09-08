/**
 * What a list says when there is nothing in it.
 *
 * IT IS A PLATE, LIKE THE LIST IT REPLACES. Both pages printed their empty
 * message as loose text on the page ground, so the moment a list emptied the
 * page lost its shape entirely — a heading, then a gap, then a sentence
 * floating in the middle of nothing. Giving it the same white surface and
 * hairline the rows would have had means the page keeps its structure whether
 * it holds five articles or none, and the message sits somewhere rather than
 * nowhere.
 *
 * Centred inside that plate, because a single short message has no column to
 * align to — this is the one place in the product where centred text is the
 * right answer rather than a default.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-16 text-center sm:py-20">
      <div className="max-w-[44ch]">
        <p className="font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{description}</p>
        )}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
