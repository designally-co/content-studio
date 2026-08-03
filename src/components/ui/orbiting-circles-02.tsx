"use client";

import React from "react";
import ParticleSphereAnimation from "@/components/ui/orbiting-circles-02-utils/particalsphear";

/**
 * Adapted from the shadcnspace "orbiting circles" component. Keeps the original
 * bottom-anchored "horizon" composition — the globe and orbit rings show their
 * top halves rising from the bottom — but scaled to sit inside a contained card.
 * The orbiting marks are the creative-industry sources this tool researches,
 * shown as favicons bundled locally in /public/source-logos (no CDN at runtime).
 */
type Source = { slug: string; name: string; angle: number };

// Evenly-spaced concentric rings (equal radius gaps), scaled to fit the card.
const orbits: { size: string; duration: number; sources: Source[] }[] = [
  {
    size: "w-92 h-92 md:w-140 md:h-140",
    duration: 20,
    sources: [
      { slug: "creative-boom", name: "Creative Boom", angle: -60 },
      { slug: "fast-company", name: "Fast Company", angle: 0 },
      { slug: "the-verge", name: "The Verge", angle: 60 },
    ],
  },
  {
    size: "w-106 h-106 md:w-160 md:h-160",
    duration: 26,
    sources: [
      { slug: "its-nice-that", name: "It’s Nice That", angle: -35 },
      { slug: "smashing-magazine", name: "Smashing Magazine", angle: 35 },
    ],
  },
  {
    size: "w-120 h-120 md:w-180 md:h-180",
    duration: 32,
    sources: [
      { slug: "dezeen", name: "Dezeen", angle: -65 },
      { slug: "awwwards", name: "Awwwards", angle: 0 },
      { slug: "wired", name: "Wired", angle: 65 },
    ],
  },
];

export default function OrbitingCirclesGlobe() {
  return (
    <div className="relative flex h-72 w-full justify-center overflow-hidden md:h-[25rem]">
      <style>{`
        @keyframes orbit-cw {
          from { transform: rotate(var(--start-angle)) }
          to   { transform: rotate(calc(var(--start-angle) + 360deg)) }
        }
        @keyframes orbit-ccw {
          from { transform: rotate(var(--start-angle)) }
          to   { transform: rotate(calc(var(--start-angle) - 360deg)) }
        }
        @keyframes counter-cw {
          from { transform: rotate(var(--counter-offset, 0deg)) }
          to   { transform: rotate(calc(var(--counter-offset, 0deg) - 360deg)) }
        }
        @keyframes counter-ccw {
          from { transform: rotate(var(--counter-offset, 0deg)) }
          to   { transform: rotate(calc(var(--counter-offset, 0deg) + 360deg)) }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-orbit-arm], [data-orbit-arm] > * { animation: none !important }
        }
      `}</style>

      {/* Center particle globe — bottom-anchored, top half visible */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-10 aspect-square w-76 -translate-x-1/2 translate-y-1/2 md:w-120">
        <ParticleSphereAnimation />
      </div>

      {/* Orbiting rings — bottom-anchored, top halves rising from the base */}
      {orbits.map((orbit, index) => {
        const isCW = index % 2 === 0;
        const orbitAnim = isCW ? "orbit-cw" : "orbit-ccw";
        const counterAnim = isCW ? "counter-cw" : "counter-ccw";

        return (
          <div
            key={index}
            className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-line ${orbit.size}`}
          >
            {orbit.sources.map((source, sourceIndex) => (
              <div
                key={sourceIndex}
                data-orbit-arm
                className="absolute top-0 left-1/2 -ml-[24px] flex h-1/2 origin-bottom flex-col items-center justify-start"
                style={
                  {
                    "--start-angle": `${source.angle}deg`,
                    animation: `${orbitAnim} ${orbit.duration}s linear infinite`,
                  } as React.CSSProperties
                }
              >
                <div
                  className="relative z-10 -mt-[24px] grid size-12 place-items-center rounded-full border border-line bg-surface shadow-sm"
                  style={
                    {
                      "--counter-offset": `${-source.angle}deg`,
                      animation: `${counterAnim} ${orbit.duration}s linear infinite`,
                    } as React.CSSProperties
                  }
                  role="img"
                  aria-label={source.name}
                  title={source.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/source-logos/${source.slug}.png`}
                    alt={source.name}
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className="size-7 object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
