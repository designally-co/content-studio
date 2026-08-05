"use client";

import Link from "next/link";
import { IconCheck } from "./icons";

/** Creating an article is the home surface, not a step of this article's
 *  pipeline — there is nothing here to return to. The research-and-outline
 *  pause (stages 2–3) folds into Draft & edit, since it is automatic and brief.
 */
const STAGES = [
  { n: 1, label: "Draft & edit", target: 4 },
  { n: 2, label: "Generate images", target: 6 },
  { n: 3, label: "Publish", target: 6 },
];

function visibleStage(stage: number, finalizeView?: "images" | "complete") {
  if (stage <= 5) return 1;
  if (finalizeView === "complete") return 3;
  if (finalizeView === "images") return 2;
  // Reaching stage 6 unlocks both the Images (2) and Publish (3) views.
  return 3;
}

export function Stepper({
  projectId,
  current,
  reached,
  published,
  finalizeView,
}: {
  projectId: string;
  /** the stage currently being viewed */
  current: number;
  /** the furthest stage reached (upper bound for navigation) */
  reached: number;
  /** whether the article is live on the Knowledge Hub */
  published: boolean;
  finalizeView?: "images" | "complete";
}) {
  return (
    <nav className="mt-3" aria-label="Content pipeline">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const currentVisible = visibleStage(current, finalizeView);
          const reachedVisible = visibleStage(reached);
          const done = s.n < currentVisible || (s.n === 3 && published);
          const active = s.n === currentVisible;
          const navigable = s.n <= reachedVisible;
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
                <Link href={`/pipeline/${projectId}?stage=${s.target}${s.n === 2 ? "&view=images" : s.n === 3 ? "&view=complete" : ""}`}>{content}</Link>
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
