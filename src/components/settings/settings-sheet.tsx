"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { loadSettingsAction, type SettingsData } from "./actions";
import { SECTION_LABELS, type SettingsSection } from "./sections";
import { BrandEditor } from "./brand-editor";
import { Directions } from "./directions";
import { ArticleTemplateCard } from "./article-template-card";
import { ApiKeys } from "./api-keys";
import { ModelSelectionCard } from "./model-selection-card";
import { PAGE_CLOSE_BUTTON } from "@/components/page-bar";

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
/** How far the sheet has to be pulled before letting go dismisses it. Below
 *  this a drag springs back, so a thumb that slips while reaching for the
 *  content does not close the form somebody was filling in. */
const SHEET_DISMISS = 96;

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

  /* PULL DOWN TO DISMISS, the gesture the stage sheets already answer to.
     A handle that cannot be dragged is a lie about what the surface does, so
     the bar and the behaviour arrive together or not at all.
     Only downward: this sheet has one open height, unlike the stage sheets
     which have a closed ledge to travel back to. */
  const [drag, setDrag] = useState<number | null>(null);
  const startY = useRef(0);
  /** Which pointer owns the gesture, so a second finger cannot hijack it. */
  const pointer = useRef<number | null>(null);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-backdrop) bg-ink/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        {/* THE FRAME DOES NOT SCROLL; THE COLUMN INSIDE IT DOES, and with no
            scrollbar drawn the column is the full width of the frame — so the
            gutter is stated once and is the same on both sides. Every attempt
            to keep a visible bar cost that symmetry: on the frame's edge it cut
            the corner curves, held off them it sat adrift mid-margin, and
            either way it was laid out inside the padding box and stole from the
            right margin alone. Same 92svh ceiling and 46rem measure as the
            routine sheet. */}
        <Dialog.Content
          /* The sheet's palette, plus wherever the drag has pushed it to. One
             `style`, because two on the same element is not a merge — the
             second silently replaces the first, and the sheet would lose its
             own colours the moment a thumb touched the handle. */
          style={
            drag === null
              ? SHEET
              : { ...SHEET, transform: `translateY(${drag}px)`, transition: "none" }
          }
          /* A BOTTOM SHEET ON A PHONE, a centred dialog from `lg`.
             This was one shape at every width: a 46rem panel that shrank to
             343 and floated 16px in from all four sides — a desktop dialog
             made small rather than a phone surface. Three things were wrong
             with it there. It wasted 32px of a 375px screen on margins around
             a form whose fields then had to fit in what was left. It began
             320px down and ran to the bottom, so the controls furthest from
             the thumb were the ones you reach for first. And it was the only
             modal in the app that did not arrive the way the stage sheets and
             the drawer do — from the edge nearest your hand.

             Full width, anchored to the foot, with the same rounded top the
             stage sheets use. Above `lg` every one of those rules is undone
             and the centred panel comes back untouched. */
          className="fixed inset-x-0 bottom-0 z-(--z-modal) flex max-h-[92svh] flex-col overflow-hidden rounded-t-(--radius-sheet) bg-(--sheet-bg) shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4 motion-reduce:animate-none lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(46rem,calc(100vw-2rem))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:data-open:zoom-in-95 lg:data-closed:zoom-out-95"
          aria-describedby={undefined}
        >
        {/* THE HANDLE, ON ITS OWN CENTRED ROW — the same bar, in the same
            place, doing the same thing as on a stage sheet. It is the row that
            drags rather than the header below it, because the header lives
            inside the scroller here and a gesture that both scrolls and drags
            is one that does neither reliably.

            Hidden above `lg`, where the sheet is a centred dialog with no edge
            to be pulled towards. */}
        <div
          onPointerDown={(event) => {
            startY.current = event.clientY;
            pointer.current = event.pointerId;
          }}
          onPointerMove={(event) => {
            if (pointer.current !== event.pointerId) return;
            // Down only — dragging up would lift the sheet off the bottom edge
            // it is anchored to, leaving a strip of page beneath it.
            const delta = Math.max(0, event.clientY - startY.current);
            // Capture once this is unmistakably a drag, not a tap that moved.
            if (drag === null && delta < 4) return;
            if (drag === null) event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(delta);
          }}
          onPointerUp={(event) => {
            pointer.current = null;
            if (drag === null) return;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            const delta = event.clientY - startY.current;
            setDrag(null);
            if (delta > SHEET_DISMISS) onClose();
          }}
          onPointerCancel={() => {
            pointer.current = null;
            setDrag(null);
          }}
          className="shrink-0 touch-none select-none pb-1 pt-3 lg:hidden"
        >
          <div className="flex justify-center">
            <span aria-hidden className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
        </div>

        {/* `pb` beyond the gutter, because the sheet's foot is now the bottom
            of the screen: without it the last control sits against the edge
            with no room to scroll past, and on a phone that edge is where the
            home indicator is. */}
        <div className="cs-sheet-scroll min-h-0 flex-1 overflow-y-auto p-5 pt-2 pb-10 sm:p-7 lg:pb-7">
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
            /* THE SHEET'S CLOSE, from the one constant every close in the app
               uses. A rounded-lg ghost button was the odd one out on a surface
               of pills, and it only appeared on hover — a dismissal you had to
               find rather than see. The dialog's ground is the app's own
               (#f8f8f7), so the disc's grey lands on it exactly as it does on
               a bottom sheet. */
            className={`float-right -mt-1 mb-1 ml-3 ${PAGE_CLOSE_BUTTON}`}
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
