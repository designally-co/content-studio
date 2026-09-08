"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { loadSettingsAction, type SettingsData } from "./actions";
import { BrandEditor } from "./brand-editor";
import { Directions } from "./directions";
import { ArticleTemplateCard } from "./article-template-card";
import { ApiKeys } from "./api-keys";
import { ModelSelectionCard } from "./model-selection-card";

export type SettingsSection = "brand" | "content" | "api";

export const SECTION_LABELS: Record<SettingsSection, string> = {
  brand: "Brand",
  content: "Content",
  api: "API & models",
};

/**
 * THE SHEET CARRIES ITS OWN PALETTE, matching the routine sheet exactly: a
 * neutral grey ground with white plates on it, rather than the app's own
 * surfaces. A panel floating over a page needs to read as a different plane,
 * and it gets there by being a slightly different grey, not by a border.
 */
const SHEET = {
  "--sheet-bg": "#f8f8f7",
  "--sheet-plate": "#ffffff",
  "--sheet-line": "#f0f0f0",
  "--sheet-ink": "#1a1a1a",
  "--sheet-ink-2": "#737373",
} as React.CSSProperties;

/**
 * Settings, as a panel over the work rather than a place you travel to.
 *
 * IT USED TO BE FOUR ROUTES BEHIND A SIDEBAR TAB. Which meant changing the
 * brand voice cost you your place: the Library scroll position, the draft you
 * were reading, the filters you had set — all of it torn down to show a form,
 * and rebuilt on the way back. Settings is never the destination. It is the
 * detour you take while doing something else, and a panel is what a detour
 * looks like.
 *
 * ONE SHEET WITH A RAIL, not three separate popups. Entering at the section you
 * clicked is what the menu promises; being able to go Brand → Content without
 * closing and reopening is what anyone who has actually adjusted two things at
 * once needs. The rail costs 176px and saves a round trip through the menu.
 *
 * The height is fixed rather than fitted to the content. Brand is a long form
 * and Account was two lines; a sheet that resized between them would jump under
 * the pointer every time the rail was used.
 */
export function SettingsSheet({
  section,
  onSectionChange,
  onClose,
}: {
  section: SettingsSection;
  onSectionChange: (next: SettingsSection) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [failed, setFailed] = useState(false);

  // Nothing is set before the first await, so mounting this does not cascade a
  // second render before the request has even left.
  const load = useCallback(async () => {
    try {
      const next = await loadSettingsAction();
      setData(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // The rule cannot see that every setState here is behind an await, so it
    // reads a network fetch as a synchronous cascade. This is the case its own
    // text allows — subscribing to an external system on mount — and the sheet
    // mounts once, when someone opens it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // A non-admin who reaches the API section — by any route — gets Brand.
  // The loader refuses to send the data regardless; this keeps the rail from
  // showing a tab that would only ever be empty.
  const sections: SettingsSection[] =
    data && !data.isAdmin ? ["brand", "content"] : ["brand", "content", "api"];
  const current = sections.includes(section) ? section : "brand";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-backdrop) bg-ink/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          style={SHEET}
          className="fixed left-1/2 top-1/2 z-(--z-modal) flex h-[min(46rem,90svh)] w-[min(58rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-(--sheet-bg) shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
          aria-describedby={undefined}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-6">
            <Dialog.Title className="font-heading text-[length:var(--text-h2)] font-semibold tracking-tight text-(--sheet-ink)">
              Settings
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close settings"
              className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-(--sheet-ink-2) transition-colors duration-(--duration-fast) hover:bg-chrome hover:text-(--sheet-ink) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {/* Phone: one scrolled line. Desktop: a rail. Same targets, and the
                same grey selection the sidebar uses — orange is for the thing
                you press, not for where you already are. */}
            <nav
              aria-label="Settings sections"
              className="shrink-0 overflow-x-auto px-5 py-4 [scrollbar-width:none] sm:w-44 sm:overflow-x-visible sm:py-5 sm:pl-7 sm:pr-0 [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max gap-1.5 sm:w-auto sm:flex-col sm:gap-1">
                {sections.map((key) => {
                  const active = key === current;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSectionChange(key)}
                      aria-current={active ? "true" : undefined}
                      className={`flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${
                        active
                          ? "bg-chrome-hover font-medium text-(--sheet-ink)"
                          : "text-(--sheet-ink-2) hover:bg-chrome hover:text-(--sheet-ink)"
                      }`}
                    >
                      {SECTION_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pb-8 pt-1 sm:px-7 sm:pt-5">
              {failed ? (
                <Message>
                  Settings could not be loaded.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setFailed(false);
                      void load();
                    }}
                    className="underline underline-offset-2 hover:text-(--sheet-ink)"
                  >
                    Try again
                  </button>
                </Message>
              ) : !data ? (
                <Message>Loading…</Message>
              ) : current === "brand" ? (
                <BrandEditor brand={data.brand} />
              ) : current === "content" ? (
                <div className="space-y-14">
                  <Directions rows={data.categories} />
                  <ArticleTemplateCard
                    template={data.articleTemplate}
                    onSaved={() => void load()}
                  />
                </div>
              ) : data.api ? (
                <div className="space-y-14">
                  <ApiKeys keys={data.api.keys} onSaved={() => void load()} />
                  <ModelSelectionCard
                    textModels={data.api.textModels}
                    settings={data.api.settings}
                  />
                </div>
              ) : (
                <Message>This section is for administrators.</Message>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-sm text-(--sheet-ink-2)">{children}</p>;
}
