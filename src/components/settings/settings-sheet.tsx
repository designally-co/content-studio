"use client";

import { useCallback, useEffect, useState } from "react";
/* Title and Close still come from Radix: they read the Dialog context the
   shell provides, so they work anywhere inside it. */
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { loadSettingsAction, type SettingsData } from "./actions";
import { SECTION_LABELS, type SettingsSection } from "./sections";
import { SheetDialog } from "@/components/sheet-dialog";
import { BrandEditor } from "./brand-editor";
import { Directions } from "./directions";
import { ArticleTemplateCard } from "./article-template-card";
import { ApiKeys } from "./api-keys";
import { ModelSelectionCard } from "./model-selection-card";
import { PAGE_CLOSE_BUTTON } from "@/components/page-bar";

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

  /* PULL DOWN TO DISMISS, the gesture the stage sheets already answer to.
     A handle that cannot be dragged is a lie about what the surface does, so
     the bar and the behaviour arrive together or not at all.
     Only downward: this sheet has one open height, unlike the stage sheets
     which have a closed ledge to travel back to. */
  return (
    <SheetDialog onClose={onClose}>
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
    </SheetDialog>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-sm text-(--sheet-ink-2)">{children}</p>;
}
