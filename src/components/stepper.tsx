"use client";

import Link from "next/link";
import { IconCheck } from "./icons";

const STAGES = [
  { n: 1, label: "Setup" },
  { n: 2, label: "Topics" },
  { n: 3, label: "Outline" },
  { n: 4, label: "Drafts" },
  { n: 5, label: "Refine" },
  { n: 6, label: "Finalize" },
];

export function Stepper({
  projectId,
  current,
  reached,
}: {
  projectId: string;
  /** the stage currently being viewed */
  current: number;
  /** the furthest stage reached (upper bound for navigation) */
  reached: number;
}) {
  return (
    <nav className="border-b border-line bg-surface px-4 sm:px-6 lg:px-8" aria-label="Content pipeline">
      <ol className="flex items-center gap-1 overflow-x-auto py-3">
        {STAGES.map((s, i) => {
          const done = s.n < reached;
          const active = s.n === current;
          const navigable = s.n <= reached;
          const content = (
            <span
              className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-accent-soft font-medium text-accent-ink"
                  : navigable
                    ? "text-ink-2 hover:bg-sunken"
                    : "text-ink-3"
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-accent text-white"
                    : done
                      ? "bg-ok text-white"
                      : navigable
                        ? "bg-sunken text-ink-2"
                        : "border border-line text-ink-3"
                }`}
              >
                {done ? <IconCheck width={12} height={12} /> : s.n}
              </span>
              {s.label}
            </span>
          );
          return (
            <li key={s.n} className="flex items-center">
              {navigable && !active ? (
                <Link href={`/pipeline/${projectId}?stage=${s.n}`}>{content}</Link>
              ) : (
                <span aria-current={active ? "step" : undefined}>{content}</span>
              )}
              {i < STAGES.length - 1 && (
                <span className="mx-0.5 text-ink-3" aria-hidden>
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
