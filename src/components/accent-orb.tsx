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
/* TWO RAMPS, ONE ORB. The matrix maps the library's greyscale ink onto a
   colour; which colour depends on what the orb is sitting on. `accent` is the
   brand ramp for an orb on a pale ground. `on-accent` is for an orb on the
   accent itself — where the brand tint would be a shape you cannot see,
   because it is the colour of the thing behind it.

   `on-accent` keeps a shallow ramp rather than mapping flat to #fff: the orb
   encodes its depth in ink AND alpha, and flattening the ink channel throws
   half of that away. 0.9 to 1.0 is enough to keep the near/far reading while
   staying unmistakably white against orange. */
const RAMP = {
  accent: `0.247 0 0 0 0.753
           0.412 0 0 0 0.243
           0.431 0 0 0 0.129
           0     0 0 1 0`,
  "on-accent": `0.1 0 0 0 0.9
                0.1 0 0 0 0.9
                0.1 0 0 0 0.9
                0   0 0 1 0`,
} as const;

export function AccentOrb({
  size = 26,
  state = "composing",
  paused = false,
  className = "",
  tone = "accent",
}: {
  /** Rendered CSS size, independent of the 20px render preset. */
  size?: number;
  state?: OrbState;
  paused?: boolean;
  className?: string;
  /** Which ground the orb sits on. */
  tone?: keyof typeof RAMP;
}) {
  const filterId = `orb-accent-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <svg aria-hidden focusable="false" className="pointer-events-none absolute size-0">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={RAMP[tone]} />
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
