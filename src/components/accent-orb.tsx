"use client";

import { useId } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

/**
 * The brand-tinted thinking orb.
 *
 * `thinking-orbs` paints greyscale only — no colour prop, and it never reads
 * `currentColor` — so the tint is an SVG filter mapping its ink ramp onto the
 * brand orange (Press Orange near, lightening toward `#ffa78f` far) while
 * passing alpha through untouched, which keeps the depth the orb encodes in
 * both channels.
 *
 * The library ships only two tuned presets, 64 and 20, and they are separate
 * designs rather than a scale factor; 20 is the one tuned for inline use, so it
 * stays the render size and CSS carries it from there.
 *
 * The filter id is per-instance, so any number of orbs can share a page without
 * colliding.
 */
export function AccentOrb({
  size = 26,
  state = "composing",
  paused = false,
  className = "",
}: {
  /** Rendered CSS size, independent of the 20px render preset. */
  size?: number;
  state?: OrbState;
  paused?: boolean;
  className?: string;
}) {
  const filterId = `orb-accent-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <svg aria-hidden focusable="false" className="pointer-events-none absolute size-0">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.247 0 0 0 0.753
                    0.412 0 0 0 0.243
                    0.431 0 0 0 0.129
                    0     0 0 1 0"
          />
        </filter>
      </svg>
      <ThinkingOrb
        state={state}
        size={20}
        theme="light"
        speed={0.5}
        paused={paused}
        aria-hidden
        className={`shrink-0 ${className}`}
        style={{ filter: `url(#${filterId})`, width: size, height: size }}
      />
    </>
  );
}
