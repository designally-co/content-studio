export function StageShell({
  title,
  description,
  children,
  wide,
  hideHeader,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${wide ? "max-w-7xl lg:px-12 xl:px-16" : "max-w-3xl lg:px-8"}`}>
      {!hideHeader && (
        <div className="mb-6 sm:mb-8">
          <h2 className="text-[length:var(--text-h2)]">{title}</h2>
          {description && (
            <p className="mt-1.5 max-w-[68ch] text-sm leading-(--leading-body) text-ink-3">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function ApiNotReady() {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 text-sm text-ink-2">
      <strong>ANTHROPIC_API_KEY is not configured.</strong> Generation is
      unavailable until the key is set in the server environment.
    </div>
  );
}
