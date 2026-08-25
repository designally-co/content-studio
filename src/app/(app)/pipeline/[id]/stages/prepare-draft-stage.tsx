"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SelectedTopic } from "@/db/schema";
import { ApiNotReady, StageShell } from "./stage-shell";
import { prepareSimpleArticleAction } from "../actions";

/**
 * The pause between choosing a topic and reading a draft: one source check and
 * an outline, then straight on to stage 4.
 *
 * This used to carry a second copy of the topic picker as well. Topics are now
 * chosen on the home surface before a project exists, so every project arrives
 * here already holding one and that branch was unreachable — verified against
 * the database before removing it. The stepper folds this into Draft & edit
 * rather than numbering it, because it is automatic and cannot be returned to.
 */

/**
 * The phases the preparation actually moves through, in order. There is no
 * progress channel back from the server — it is a single action wrapping a
 * web-search-backed model call — so the rail advances on elapsed time.
 *
 * That makes the timings an estimate, and the labels are written to stay true
 * anyway: each names the work being attempted, not an outcome being claimed.
 * The source check in particular is best-effort — a failure falls back to a
 * source-free plan rather than stopping — so "checking" is the honest verb.
 */
const PHASES = [
  { at: 0, label: "Reading your topic", note: "Angle, format and language." },
  { at: 3, label: "Checking a current source", note: "Best-effort — the draft continues either way." },
  { at: 15, label: "Shaping the outline", note: "Sections, points and sources." },
  { at: 27, label: "Opening your draft", note: "Bringing it through to the editor." },
] as const;

/** What a typical run takes. Past this the copy stops promising and starts reassuring. */
const TYPICAL_SECONDS = 35;

function DraftProgress({ title }: { title: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // The final phase never resolves on a timer: this component is replaced by
  // the editor when the real work finishes, so the rail cannot report a
  // completion the server has not actually reached.
  let active = 0;
  for (let i = 0; i < PHASES.length; i++) if (elapsed >= PHASES[i].at) active = i;

  const overrun = elapsed > TYPICAL_SECONDS;
  const mins = Math.floor(elapsed / 60);
  const clock = `${mins}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="cs-bezel mx-auto max-w-2xl">
      <div className="cs-bezel-core px-6 py-7 sm:px-8 sm:py-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">Preparing</p>
        <h3 className="mt-3 font-heading text-[length:var(--text-h3)] font-bold leading-snug tracking-tight text-ink">
          {title}
        </h3>

        {/* One live region for the whole rail: a screen reader hears the phase
            it moved to, not four list items re-announcing themselves. */}
        <ol className="mt-7 space-y-1" aria-live="polite">
          {PHASES.map((phase, i) => {
            const state = i < active ? "done" : i === active ? "active" : "pending";
            return (
              <li
                key={phase.label}
                className="flex gap-4 rounded-2xl px-3 py-3 transition-colors duration-[320ms] ease-[var(--ease-spring)]"
                style={{ background: state === "active" ? "var(--accent-soft)" : "transparent" }}
              >
                <span className="relative mt-[3px] flex size-2.5 shrink-0 items-center justify-center">
                  {state === "active" && (
                    <span className="cs-ping absolute inline-flex size-2.5 rounded-full bg-accent" aria-hidden="true" />
                  )}
                  <span
                    className="relative inline-flex size-2.5 rounded-full transition-all duration-[320ms] ease-[var(--ease-spring)]"
                    style={{
                      background:
                        state === "pending" ? "transparent" : state === "done" ? "var(--ink-300)" : "var(--accent)",
                      boxShadow: state === "pending" ? "inset 0 0 0 1.5px var(--ink-200)" : "none",
                    }}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-medium transition-colors duration-[320ms] ease-[var(--ease-spring)]"
                    style={{ color: state === "pending" ? "var(--ink-400)" : state === "done" ? "var(--ink-secondary)" : "var(--accent-press)" }}
                  >
                    {phase.label}
                  </span>

                  {state === "active" && (
                    <>
                      <span className="mt-1 block text-xs text-ink-3">{phase.note}</span>
                      {/* Indeterminate on purpose — see .cs-sweep. */}
                      <span
                        className="mt-2.5 block h-[3px] w-full overflow-hidden rounded-full"
                        style={{ background: "var(--accent-tint)" }}
                        aria-hidden="true"
                      >
                        <span className="cs-sweep block h-full w-1/4 rounded-full" style={{ background: "var(--accent)" }} />
                      </span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {/* The outline taking shape. Lines arrive as the rail advances, so the
            wait has something visibly accumulating behind it. */}
        <div className="mt-7 space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`block h-2 rounded-full transition-all duration-[600ms] ease-[var(--ease-spring)] ${
                active > i ? "cs-shimmer" : ""
              }`}
              style={{
                background: "var(--ink-100)",
                width: active > i ? ["78%", "92%", "64%"][i] : "0%",
                opacity: active > i ? undefined : 0,
              }}
            />
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-5">
          <p className="text-sm text-ink-2">
            {overrun ? "Still working — this one is taking longer than usual." : `Usually ready in about ${TYPICAL_SECONDS} seconds.`}
          </p>
          <p className="font-mono text-xs tabular-nums text-ink-3" aria-label={`${elapsed} seconds elapsed`}>
            {clock}
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Keep this tab open — it moves on to the editor by itself.
        </p>
      </div>
    </div>
  );
}

export function PrepareDraftStage({
  projectId,
  selected,
  anthropicReady,
}: {
  projectId: string;
  selected: SelectedTopic | null;
  anthropicReady: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const started = useRef(false);

  async function prepareDraft() {
    setError(null);
    try {
      const result = await prepareSimpleArticleAction(projectId);
      // The action reports failure as data rather than throwing, because a
      // thrown server-action error is redacted in production and arrives as a
      // sentence about Server Components that names nothing.
      if (!result.ok) {
        setError(result.message);
        started.current = false;
        return;
      }
      // The action persists the outline and bumps the project to stage 4, but
      // no longer redirects — a server-action redirect throws NEXT_REDIRECT,
      // which this try/catch would swallow and leave the page stuck.
      router.replace(`/pipeline/${projectId}?stage=4`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the draft.");
      started.current = false;
    }
  }

  useEffect(() => {
    if (!anthropicReady || !selected || started.current) return;
    started.current = true;
    void prepareDraft();
    // Preparation persists each completed phase server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, projectId, selected]);

  if (!anthropicReady) return <StageShell title="Draft"><ApiNotReady /></StageShell>;

  // Defensive only: no project reaches this stage without a topic, but a blank
  // screen would be the worst possible way to find out otherwise.
  if (!selected) {
    return (
      <StageShell title="Draft" description="This article has no topic yet.">
        <p className="text-sm leading-relaxed text-ink-2">
          Start it again from Create and it will come straight through to the draft.
        </p>
      </StageShell>
    );
  }

  // The failed run replaces the progress rail rather than sitting under it: a
  // rail that keeps animating beneath an error reads as still working.
  if (error) {
    return (
      <StageShell title="Draft" wide>
        <div className="cs-bezel mx-auto max-w-2xl">
          <div className="cs-bezel-core px-6 py-7 sm:px-8 sm:py-9">
            <h3 className="font-heading text-[length:var(--text-h3)] font-bold tracking-tight text-ink">
              The draft did not start
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{error}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              Nothing was lost — your topic is saved and this can be run again.
            </p>
            <button
              type="button"
              onClick={() => {
                started.current = true;
                void prepareDraft();
              }}
              className="cs-btn cs-btn-primary mt-6"
            >
              Try again
            </button>
          </div>
        </div>
      </StageShell>
    );
  }

  return (
    <StageShell title="Draft" wide>
      <DraftProgress title={selected.title} />
    </StageShell>
  );
}
