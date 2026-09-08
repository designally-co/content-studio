"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { loadSettingsAction, type SettingsData } from "./actions";
import { SECTION_LABELS, type SettingsSection } from "./sections";
import { BrandEditor } from "./brand-editor";
import { Directions } from "./directions";
import { ArticleTemplateCard } from "./article-template-card";
import { ApiKeys } from "./api-keys";
import { ModelSelectionCard } from "./model-selection-card";

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
 * One settings section, as a panel over the work rather than a place you go.
 *
 * IT USED TO BE FOUR ROUTES BEHIND A SIDEBAR TAB. Which meant changing the
 * brand voice cost you your place: the Library scroll position, the draft you
 * were reading, the filters you had set — all torn down to show a form, and
 * rebuilt on the way back. Settings is never the destination. It is the detour
 * you take while doing something else, and a panel is what a detour looks like.
 *
 * ONE SECTION PER SHEET. A rail down the left would only restate the menu you
 * just used, one press earlier and one place further from your eye — a second
 * navigation for three items, inside a panel opened by a first. The sheet shows
 * the thing you named and nothing else; going somewhere else means saying so,
 * which is one press either way.
 *
 * That is also why it is sized to its content rather than to a fixed frame.
 * With a rail the height had to be pinned or the frame would jump as you moved
 * between a long form and a short one. Alone, each sheet is only ever as tall
 * as the one thing it holds.
 */
export function SettingsSheet({
  section,
  onClose,
}: {
  section: SettingsSection;
  onClose: () => void;
}) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [failed, setFailed] = useState(false);

  // Nothing is set before the first await, so mounting this does not cascade a
  // second render before the request has even left.
  const load = useCallback(async () => {
    try {
      const next = await loadSettingsAction(section);
      setData(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [section]);

  useEffect(() => {
    // The rule cannot see that every setState here is behind an await, so it
    // reads a network fetch as a synchronous cascade. This is the case its own
    // text allows — subscribing to an external system on mount — and the sheet
    // mounts once, when someone opens it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-backdrop) bg-ink/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          style={SHEET}
          className="fixed left-1/2 top-1/2 z-(--z-modal) max-h-[90svh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-(--sheet-bg) p-5 shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none sm:p-7"
          aria-describedby={undefined}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            {/* The section names itself. "Settings" as a title, with the section
                named again on a rail beside it, said the same thing twice. */}
            <Dialog.Title className="font-heading text-[length:var(--text-h2)] font-semibold tracking-tight text-(--sheet-ink)">
              {SECTION_LABELS[section]}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-(--sheet-ink-2) transition-colors duration-(--duration-fast) hover:bg-chrome hover:text-(--sheet-ink) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          {failed ? (
            <Message>
              This section could not be loaded.{" "}
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
          ) : data.section === "brand" ? (
            <BrandEditor brand={data.brand} />
          ) : data.section === "content" ? (
            <div className="space-y-14">
              <Directions rows={data.categories} />
              <ArticleTemplateCard
                template={data.articleTemplate}
                onSaved={() => void load()}
              />
            </div>
          ) : (
            <div className="space-y-14">
              <ApiKeys keys={data.keys} onSaved={() => void load()} />
              <ModelSelectionCard textModels={data.textModels} settings={data.settings} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-sm text-(--sheet-ink-2)">{children}</p>;
}
