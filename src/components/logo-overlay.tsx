"use client";

import type { CSSProperties } from "react";
import type { LogoOverlay, LogoPosition } from "@/db/schema";

const POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: "top-left", label: "Top L" },
  { value: "top-right", label: "Top R" },
  { value: "center", label: "Center" },
  { value: "bottom-left", label: "Bot L" },
  { value: "bottom-right", label: "Bot R" },
];

// 4% of width padding — matches the server compositor (W * 0.04).
const PAD = "4%";

function positionStyle(p: LogoPosition): CSSProperties {
  switch (p) {
    case "top-left":
      return { top: PAD, left: PAD };
    case "top-right":
      return { top: PAD, right: PAD };
    case "bottom-left":
      return { bottom: PAD, left: PAD };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "bottom-right":
    default:
      return { bottom: PAD, right: PAD };
  }
}

/**
 * CSS preview of the logo composited on a base — kept in sync with the server
 * `compositeLogo` math (same 4% padding, size-as-%-of-width, opacity, shadow).
 */
export function LogoOverlayPreview({
  baseSrc,
  logoSrc,
  overlay,
  className,
  aspectRatio = "1:1",
}: {
  baseSrc?: string;
  logoSrc?: string;
  overlay: LogoOverlay;
  className?: string;
  aspectRatio?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-deep ${className ?? ""}`}
      style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
    >
      {baseSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={baseSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute"
          style={{
            width: `${overlay.sizePct}%`,
            height: "auto",
            opacity: overlay.opacity,
            filter: overlay.shadow
              ? "drop-shadow(0 2px 6px rgba(0,0,0,0.45))"
              : undefined,
            ...positionStyle(overlay.position),
          }}
        />
      ) : null}
    </div>
  );
}

export function LogoOverlayControls({
  value,
  onChange,
  disabled,
}: {
  value: LogoOverlay;
  onChange: (next: LogoOverlay) => void;
  disabled?: boolean;
}) {
  function set<K extends keyof LogoOverlay>(key: K, v: LogoOverlay[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div
      className={`space-y-4 ${disabled ? "pointer-events-none opacity-50" : ""}`}
      aria-disabled={disabled}
    >
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Position</p>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set("position", p.value)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                value.position === p.value
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Size</span>
          <span className="tabular-nums text-foreground">{value.sizePct}%</span>
        </span>
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={value.sizePct}
          onChange={(e) => set("sizePct", Number(e.target.value))}
          className="w-full accent-primary"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Opacity</span>
          <span className="tabular-nums text-foreground">
            {Math.round(value.opacity * 100)}%
          </span>
        </span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={Math.round(value.opacity * 100)}
          onChange={(e) => set("opacity", Number(e.target.value) / 100)}
          className="w-full accent-primary"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.shadow}
          onChange={(e) => set("shadow", e.target.checked)}
          className="size-4 accent-primary"
        />
        Subtle shadow (for legibility)
      </label>
    </div>
  );
}
