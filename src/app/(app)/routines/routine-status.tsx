"use client";

import type { RoutineRunStatus } from "@/db/schema";

/**
 * What a routine is doing, as one word.
 *
 * THE PAGE EXISTS TO ANSWER "IS IT WORKING", and it used to answer in
 * paragraphs: three lines of grey and red sentences per card, so telling a
 * healthy routine from a broken one meant reading all of them. A state has to
 * be legible before it is read.
 *
 * Colour never carries it alone — every state is a word first, with a dot as
 * reinforcement (WCAG 2.2 AA, and the system's own rule for semantic colour).
 * The dot is 8px and the word is set in the label ramp, so a column of these
 * scans without any of them shouting.
 */

export type RoutineState = "running" | "failed" | "scheduled" | "paused" | "manual";

export function routineState({
  running,
  enabled,
  isManual,
  lastStatus,
}: {
  running: boolean;
  enabled: boolean;
  isManual: boolean;
  lastStatus?: RoutineRunStatus | null;
}): RoutineState {
  /* Order is a priority list, not a switch. A routine can be failing AND
     paused AND manual at once; what it is DOING right now outranks what it
     did, and what it did outranks how it is configured. */
  if (running) return "running";
  if (lastStatus === "failed") return "failed";
  if (isManual) return "manual";
  return enabled ? "scheduled" : "paused";
}

const TONE: Record<RoutineState, { dot: string; text: string; label: string }> = {
  /* Running takes the accent because it is the one state that is happening
     rather than merely true — and it is temporary, so the orange is spent for
     minutes rather than parked on the page. */
  running: { dot: "bg-accent", text: "text-accent-ink", label: "Running" },
  failed: { dot: "bg-danger", text: "text-danger-ink", label: "Needs attention" },
  scheduled: { dot: "bg-ok", text: "text-ok-ink", label: "Scheduled" },
  paused: { dot: "bg-line-strong", text: "text-ink-3", label: "Paused" },
  manual: { dot: "bg-line-strong", text: "text-ink-3", label: "By hand" },
};

export function StatusMark({ state }: { state: RoutineState }) {
  const tone = TONE[state];
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${tone.text}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}
