"use client";

import { DropdownMenu } from "radix-ui";
import { Check, ChevronRight, ImagePlus, Sparkles, SlidersHorizontal } from "lucide-react";

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

const TRIGGER =
  "cs-tool shrink-0 data-[state=open]:bg-sunken data-[state=open]:text-ink";

export type Choice = { value: string; label: string; description?: string };

/** One nested list: a row that names the setting and shows what it is set to. */
function Group({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (next: string) => void;
}) {
  const current = choices.find((choice) => choice.value === value);
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={`${ITEM} data-[state=open]:bg-sunken`}>
        <span className="flex-1">{label}</span>
        {/* The value lives on the parent row, so the menu answers what it is
            set to without being opened a second time. */}
        <span className="max-w-36 truncate text-ink-3">{current?.label ?? "—"}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className={`${PANEL} max-w-72`} sideOffset={6} collisionPadding={12}>
          {choices.map((choice) => {
            const active = choice.value === value;
            return (
              <DropdownMenu.Item
                key={choice.value}
                className={`${ITEM} items-start py-2`}
                onSelect={() => onChange(choice.value)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{choice.label}</span>
                  {/* Each option carries its own rationale here, where it is
                      useful, rather than as helper text stacked under a control
                      nobody is looking at yet. */}
                  {choice.description && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">
                      {choice.description}
                    </span>
                  )}
                </span>
                <Check
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 ${active ? "text-ink" : "invisible"}`}
                />
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
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
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={TRIGGER} disabled={disabled} aria-label="Image settings">
        <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.6} />
        Settings
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* Upwards: the dock sits at the foot of the stage, so a menu opening
            downwards would leave the screen. */}
        <DropdownMenu.Content className={PANEL} side="top" align="start" sideOffset={8} collisionPadding={12}>
          <Group label="Model" value={model} choices={models} onChange={onModel} />
          <Group
            label="Aspect ratio"
            value={ratio}
            choices={ratios.map((value) => ({ value, label: value }))}
            onChange={onRatio}
          />
          <Group
            label="Images"
            value={String(count)}
            choices={Array.from({ length: Math.max(1, maxVariations) }, (_, index) => {
              const value = index + 1;
              return { value: String(value), label: `${value} image${value > 1 ? "s" : ""}` };
            })}
            onChange={(next) => onCount(Number(next))}
          />
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
  const label = uploading
    ? "Uploading…"
    : finding
      ? "Looking…"
      : missing
        ? "Reference required"
        : "Reference";

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          className={`${TRIGGER} ${missing ? "text-danger-ink" : ""}`}
          disabled={disabled}
        >
          <ImagePlus aria-hidden className="size-4" strokeWidth={1.6} />
          {label}
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
