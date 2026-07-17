export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-h1)]">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-[68ch] text-sm leading-(--leading-body) text-ink-3">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex w-full items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}
