export function StageShell({
  title,
  description,
  children,
  wide,
  hideHeader,
  flushBottom,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
  hideHeader?: boolean;
  /**
   * Drops the stage's bottom padding for a stage that ends in a bottom-anchored
   * element. A sticky child cannot travel past its container's content box, so
   * that padding would hold it up off the viewport edge and read as dead space.
   */
  flushBottom?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full px-4 pt-8 sm:px-6 sm:pt-12 ${
        flushBottom ? "pb-0" : "pb-20 sm:pb-28"
      } ${wide ? "max-w-7xl lg:px-12 xl:px-16" : "max-w-3xl lg:px-8"}`}
    >
      {/* The stepper names the current stage visibly, so printing it again in
          the body would say nothing. It remains the page's h1 because the
          chrome no longer carries one, and a page with no top-level heading
          leaves heading navigation with nowhere to start. */}
      <h1 className="sr-only">{title}</h1>
      {/* Only supplied when it says something the screen cannot — why a wait is
          happening, or what a state means. A sentence narrating what the visible
          controls already do is instruction nobody needed. */}
      {!hideHeader && description && (
        <p className="mb-8 max-w-[68ch] text-balance leading-relaxed text-ink-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:mb-10">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export function ApiNotReady() {
  return (
    <div className="rounded-2xl bg-warn-soft px-5 py-4 text-sm leading-relaxed text-ink-2">
      <strong className="font-semibold text-ink">ANTHROPIC_API_KEY is not configured.</strong>{" "}
      Generation is unavailable until the key is set in the server environment.
    </div>
  );
}
