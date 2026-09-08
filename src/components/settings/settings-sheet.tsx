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
        {/* THE FRAME DOES NOT SCROLL; THE COLUMN INSIDE IT DOES. With the
            scroll on the rounded box itself, the scrollbar rode the sheet's
            outer edge and cut across both corner curves. Holding the side
            padding out here and scrolling within it insets the bar by the same
            gutter as the content, so it sits inside the sheet rather than on
            its rim. Same 92svh ceiling and 46rem measure as the routine sheet. */}
        <Dialog.Content
          style={SHEET}
          className="fixed left-1/2 top-1/2 z-(--z-modal) flex max-h-[92svh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-(--sheet-bg) px-5 shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none sm:px-7"
          aria-describedby={undefined}
        >
        <div className="min-h-0 flex-1 overflow-y-auto py-5 sm:py-7">
          {/* NOT DRAWN, BUT STILL SAID. A dialog has to have a name — it is what
              a screen reader announces on open, and Radix warns without one —
              so the section still titles the sheet, just not twice. The content
              already opens with its own heading ("Brand identity", "Content
              directions"), and a sheet reached by pressing "Brand" does not
              need "Brand" written across the top to say where you are. */}
          <Dialog.Title className="sr-only">{SECTION_LABELS[section]}</Dialog.Title>

          {/* Floated rather than given a row of its own. With the title gone
              that row held nothing but the close button, and a 36px band of
              empty above every sheet is a worse trade than letting the first
              heading flow around it — which is the one thing float is for. */}
          <Dialog.Close
            aria-label="Close"
            /* No negative right margin. It optically aligned the icon inside
               the old padded header, but here it puts the button 4px past the
               scroller's content box — enough to raise a horizontal scrollbar
               across the foot of every sheet. */
            className="-mt-1 ml-3 mb-1 grid size-9 shrink-0 float-right place-items-center rounded-lg text-(--sheet-ink-2) transition-colors duration-(--duration-fast) hover:bg-chrome hover:text-(--sheet-ink) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            <X aria-hidden className="size-5" />
          </Dialog.Close>

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
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-sm text-(--sheet-ink-2)">{children}</p>;
}
