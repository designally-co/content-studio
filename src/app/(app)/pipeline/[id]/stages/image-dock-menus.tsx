"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Sparkles, SlidersHorizontal } from "lucide-react";

/**
 * The image dock's controls, folded into two menus.
 *
 * FIVE CONTROLS SAT IN THE ROW BENEATH THE PROMPT — model, ratio, variations,
 * find references, upload — and the row wrapped onto two lines at anything
 * narrower than a desktop, which put the send button below the fold of its own
 * dock. Four of the five are things you set once and rarely revisit; the prompt
 * is the control you actually came to use, and it was sharing its dock with a
 * settings panel.
 *
 * Two menus now: what the image IS, and what it is BASED ON. Nested rather than
 * flat, so the values stay one press away and the menu itself stays short — the
 * parent row carries the current value, so opening the menu answers "what is it
 * set to" without opening anything further.
 */

const ITEM =
  "flex min-h-10 w-full cursor-default select-none items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors data-disabled:pointer-events-none data-disabled:opacity-50 text-ink data-highlighted:bg-sunken";

/* No border. The shadow already separates it from the page, and a hairline as
   well makes a floating layer look like a boxed one. */
const PANEL =
  "z-(--z-dropdown) min-w-52 rounded-2xl bg-surface p-2 shadow-[var(--shadow-pop)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none";

/**
 * An outlined disc, the same one the send button is.
 *
 * These were `cs-tool` — a borderless pill carrying an icon AND a word — and
 * between them they put "Settings" and "Reference required" in the control row
 * of a dock whose actual instruction is the sentence you type above them. Two
 * labels for two things you set once, competing with the one thing you do every
 * time. The icons carry it; the words move to the accessible name and the
 * tooltip, where they answer the question only if it is asked.
 */
const TRIGGER =
  "cs-btn cs-dock-btn-icon shrink-0 data-[state=open]:bg-chrome-active data-[state=open]:text-ink";

/**
 * FILLED, NOT OUTLINED — the same soft grey disc Create's dock wears, and the
 * same one every close button in the app is drawn as.
 *
 * These used to be outlined in `--border-strong`, because `cs-btn` draws its
 * hairline in `--border` and on the dock's white that computed to #f0f0f0 and
 * read as no outline at all. Which was true, and the answer was the wrong one:
 * a darker ring made these two the most strongly drawn things in a row whose
 * whole point is the action at its other end. A fill states the target without
 * drawing a line around it.
 *
 * It stays stated at each use rather than living in TRIGGER, because the
 * reference button's missing state tints its border: two border-colour
 * utilities on one element are the same specificity, so the winner would be
 * whichever Tailwind emitted last rather than whichever was written last —
 * the trap that once left the stepper's current pill unedged.
 */
const RING = "border-transparent bg-chrome text-ink-2 enabled:hover:bg-chrome-active enabled:hover:text-ink";

/* NO DESCRIPTION. Each model used to carry a line of its strengths under its
   name, which turned a list of four names into a wall of small grey prose you
   had to read past to find the one you already knew you wanted — and made the
   panel tall enough to need its own scroll on a phone. A name is what you pick
   by; what a model is good at belongs where you are deciding which to buy, not
   where you are switching between them. */
export type Choice = { value: string; label: string };

/**
 * A setting, as a row you press and a panel that replaces the one you were on.
 *
 * NOT A FLYOUT. `DropdownMenu.Sub` opens its child BESIDE the parent, and
 * beside is a direction a phone does not have: a 264px panel with a 288px list
 * next to it needs 550, and on a 375px screen the second level opened at x=285
 * and ran 198px past the right edge. Most of the model list was simply not
 * reachable — and collision handling cannot save it, because there is no side
 * with room on either hand.
 *
 * So the second level takes the place of the first, with a row back. It is the
 * same shape the direction picker on Create already uses, and it costs a
 * desktop nothing: seeing the parent list while choosing from the child was
 * never what the parent list was for.
 */
type Group = { key: string; label: string; value: string; choices: Choice[]; onChange: (next: string) => void };

/** The row on the first level: names the setting and what it is set to. */
function GroupRow({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const current = group.choices.find((choice) => choice.value === group.value);
  return (
    <DropdownMenu.Item
      className={ITEM}
      /* The menu stays open — this row goes deeper into it rather than
         choosing anything, and a dismiss here would close the whole thing on
         the way to the list you asked for. */
      onSelect={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      <span className="flex-1">{group.label}</span>
      {/* The value lives on the parent row, so the menu answers what it is set
          to without being opened a second time. */}
      <span className="max-w-36 truncate text-ink-3">{current?.label ?? "—"}</span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
    </DropdownMenu.Item>
  );
}

/** The second level: one setting's choices, in the panel the rows were in. */
function GroupChoices({ group, onBack }: { group: Group; onBack: () => void }) {
  return (
    <>
      <DropdownMenu.Item
        className={`${ITEM} text-ink-2`}
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <ChevronLeft aria-hidden className="size-4 shrink-0" />
        <span className="flex-1 font-medium">{group.label}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      {/* Capped and scrollable: the model list is longer than a phone, and
          `--radix-dropdown-menu-content-available-height` is what the panel
          actually has between the trigger and the edge of the screen. */}
      <div className="max-h-[min(60svh,var(--radix-dropdown-menu-content-available-height,60svh))] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {group.choices.map((choice) => {
          const active = choice.value === group.value;
          return (
            <DropdownMenu.Item
              key={choice.value}
              className={ITEM}
              onSelect={() => group.onChange(choice.value)}
            >
              <span className="min-w-0 flex-1 truncate">{choice.label}</span>
              <Check
                aria-hidden
                className={`size-4 shrink-0 ${active ? "text-ink" : "invisible"}`}
              />
            </DropdownMenu.Item>
          );
        })}
      </div>
    </>
  );
}

export function ImageSettingsMenu({
  models,
  model,
  onModel,
  ratios,
  ratio,
  onRatio,
  maxVariations,
  count,
  onCount,
  disabled,
}: {
  models: Choice[];
  model: string;
  onModel: (next: string) => void;
  ratios: readonly string[];
  ratio: string;
  onRatio: (next: string) => void;
  maxVariations: number;
  count: number;
  onCount: (next: number) => void;
  disabled?: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const groups: Group[] = [
    { key: "model", label: "Model", value: model, choices: models, onChange: onModel },
    {
      key: "ratio",
      label: "Aspect ratio",
      value: ratio,
      choices: ratios.map((value) => ({ value, label: value })),
      onChange: onRatio,
    },
    {
      key: "count",
      label: "Images",
      value: String(count),
      choices: Array.from({ length: Math.max(1, maxVariations) }, (_, index) => {
        const value = index + 1;
        return { value: String(value), label: `${value} image${value > 1 ? "s" : ""}` };
      }),
      onChange: (next) => onCount(Number(next)),
    },
  ];
  const active = groups.find((group) => group.key === openGroup) ?? null;

  return (
    /* Reopening always starts at the top level: the panel that is up is a
       property of this visit, not a setting, and coming back to a menu still
       showing the list you last drilled into is disorienting. */
    <DropdownMenu.Root modal={false} onOpenChange={(open) => !open && setOpenGroup(null)}>
      <DropdownMenu.Trigger
        className={`${TRIGGER} ${RING}`}
        disabled={disabled}
        aria-label="Image settings"
        title="Image settings"
      >
        <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.6} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* Upwards: the dock sits at the foot of the stage, so a menu opening
            downwards would leave the screen. `max-w` keeps the second level
            inside a phone — it is the widest of the two, and the panel is one
            element now rather than two side by side. */}
        <DropdownMenu.Content
          className={`${PANEL} w-[min(20rem,calc(100vw-1.5rem))]`}
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
        >
          {active ? (
            <GroupChoices group={active} onBack={() => setOpenGroup(null)} />
          ) : (
            groups.map((group) => (
              <GroupRow key={group.key} group={group} onOpen={() => setOpenGroup(group.key)} />
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Where a reference picture comes from: found in the article, or supplied.
 *
 * The upload row IS the file input's label rather than a button that clicks one
 * for it — the browser opens the picker from the label natively, and a
 * programmatic `.click()` out of a menu callback is the kind of thing a browser
 * is entitled to refuse.
 */
export function ReferenceMenu({
  canFind,
  finding,
  onFind,
  uploading,
  missing,
  fileInput,
  disabled,
}: {
  canFind: boolean;
  finding: boolean;
  onFind: () => void;
  uploading: boolean;
  missing: boolean;
  /** Rendered by the caller, outside the menu, so it survives the menu closing. */
  fileInput: React.ReactNode;
  disabled?: boolean;
}) {
  const busy = uploading || finding;
  /* THE STATE HAS TO SURVIVE LOSING THE LABEL. It was the label — "Uploading…",
     "Looking…", "Reference required" — so with the word gone it moves into the
     three things an icon button still has: the accessible name, the tooltip,
     and the drawing. A required reference is the one state that must be visible
     without hovering, so it also takes the danger ink and a tinted outline. */
  const label = uploading
    ? "Uploading a reference…"
    : finding
      ? "Looking for a reference…"
      : missing
        ? "Reference required"
        : "Reference image";

  return (
    <>
      <DropdownMenu.Root modal={false}>
        {/* A DISC, LIKE SETTINGS. It carried the word "Reference" on the
            reasoning that a missing reference is a state worth naming on the
            face of the button — but the two controls at this end of the dock
            are the same kind of thing, values you set before pressing the one
            at the other end, and a labelled pill beside a disc read as two
            unrelated controls rather than a pair. The missing state still
            speaks: the tint carries it, and the word survives in the
            accessible name and the tooltip. */}
        <DropdownMenu.Trigger
          className={`${TRIGGER} ${
            missing
              ? "border-transparent bg-danger-soft text-danger-ink enabled:hover:bg-danger-soft"
              : RING
          }`}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          {busy ? (
            <LoaderCircle
              aria-hidden
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={1.6}
            />
          ) : (
            <ImagePlus aria-hidden className="size-4" strokeWidth={1.6} />
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={PANEL} side="top" align="start" sideOffset={8} collisionPadding={12}>
            {/* Finding is offered whatever model is selected: it is an act on
                the article, and it switches the model itself if the one in the
                dock cannot read what it found. */}
            <DropdownMenu.Item
              className={ITEM}
              disabled={!canFind || finding}
              onSelect={() => onFind()}
            >
              <Sparkles aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
              {finding ? "Looking…" : "Find in the article"}
            </DropdownMenu.Item>

            <DropdownMenu.Item className={ITEM} disabled={uploading} asChild>
              <label className="cursor-pointer">
                <ImagePlus aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
                {uploading ? "Uploading…" : "Upload an image"}
                {fileInput}
              </label>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
