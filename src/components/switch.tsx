"use client";

/**
 * On or off, wherever the switching IS the change.
 *
 * A NATIVE CHECKBOX WAS DOING THIS JOB, and a checkbox is a form field — it
 * reads as something you tick on the way to pressing Save. There is no Save
 * here: this control IS the change, and it takes effect the moment it moves.
 * A switch is the shape people already read as live state, which is what it is.
 *
 * `role="switch"` rather than a styled checkbox, so assistive technology
 * announces "on/off" rather than "checked", and the whole control is one 44px
 * target — the thumb alone is 20px, which is a coarse-pointer miss waiting to
 * happen.
 *
 * NO WORD BESIDE IT. A switch that is on already says so by being on, and the
 * label repeating it competes with the name of the thing being switched. The
 * state is still announced — `role="switch"` with `aria-checked` is exactly
 * how a screen reader is told — so nothing is lost by not printing it.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Names the thing, so a screen reader hears which one this switches. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group/switch inline-grid min-h-11 min-w-11 place-items-center rounded-lg transition-opacity disabled:pointer-events-none disabled:opacity-45"
    >
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-(--duration-fast) ease-(--ease-out) group-focus-visible/switch:shadow-[var(--shadow-focus)] ${
          checked ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(36,31,28,0.25)] transition-[left] duration-(--duration-fast) ease-(--ease-out) ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
