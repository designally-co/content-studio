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
  const currentVisible = visibleStage(current, finalizeView);
  const reachedVisible = visibleStage(reached);

  return (
    <nav aria-label="Content pipeline">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const done = s.n < currentVisible || (s.n === 3 && published);
          const active = s.n === currentVisible;
          const navigable = s.n <= reachedVisible;
          const content = (
            <span
              className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors duration-(--duration-fast) ease-(--ease-spring) ${
                active
                  ? "bg-accent-soft text-accent-press"
                  : navigable
                    ? "text-ink-2 hover:bg-sunken hover:text-ink"
                    : "text-ink-3"
              }`}
            >
              {/* The numeral is ink, not white. A 12px bold number is not
                  "large text", so it owes 4.5:1 — and white on Designally
                  Orange is 3.24:1. The system crosses that floor for a button
                  LABEL, where the word is the action and a hover darkens
                  underneath it; a step number has neither. It resolved this
                  exact case the same way on the survey's disc: charcoal
                  numerals, 5.19:1 — the second place the pure orange is
                  called legal. */}
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-(--duration-fast) ease-(--ease-spring) ${
                  active
                    ? "bg-accent text-ink"
                    : done
                      ? "bg-ok text-white"
                      : navigable
                        ? "bg-sunken text-ink-2"
                        : "bg-deep text-ink-3"
                }`}
              >
                {done ? <IconCheck width={11} height={11} /> : s.n}
              </span>
              {s.label}
            </span>
          );
          return (
            <li key={s.n} className="flex items-center">
              {navigable && !active ? (
                <Link
                  href={`/pipeline/${projectId}?stage=${s.target}${s.n === 2 ? "&view=images" : s.n === 3 ? "&view=complete" : ""}`}
                  className="rounded-full focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={active ? "step" : undefined}>{content}</span>
              )}
              {/* A rule that carries progress, rather than a chevron that only
                  points. It fills once the step behind it is complete. */}
              {i < STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-1 h-px w-4 shrink-0 rounded-full transition-colors duration-(--duration-base) ease-(--ease-spring) sm:w-6 ${
                    done ? "bg-ok" : "bg-line"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
