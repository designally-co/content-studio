import type { RoutineHubStatus, RoutineRunStatus, RoutineStep } from "@/db/schema";
import type { RoutineScheduleKind } from "@/lib/autopilot/schedule";

/**
 * What the Routines page draws.
 *
 * A plain module with no directive, because these shapes are read by client
 * components and produced by server ones — the one arrangement that cannot
 * break (see AGENTS.md). Dates are ISO strings: a Date crossing the server
 * boundary is fine, but a string is unambiguous and formats where the reader is.
 */
export type RoutineView = {
  id: string;
  name: string;
  enabled: boolean;
  categoryId: string | null;
  /** Null means it rotates through every active direction. */
  directionName: string | null;
  hubStatus: RoutineHubStatus;
  imagesPerRun: number;
  maxPerDay: number;
  scheduleKind: RoutineScheduleKind;
  runAt: string;
  timeZone: string;
  weekday: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type RunView = {
  id: string;
  routineId: string;
  projectId: string | null;
  step: RoutineStep;
  status: RoutineRunStatus;
  error: string | null;
  startedAt: string;
  title: string;
  hubUrl: string | null;
};

/**
 * The seven steps, in order, in words rather than in the state machine's own
 * vocabulary. A person watching a run wants to know what is happening, not
 * which case of a switch statement is executing.
 */
export const STEP_ORDER: RoutineStep[] = [
  "topic",
  "plan",
  "draft",
  "prompt",
  "reference",
  "images",
  "publish",
];

export const STEP_LABELS: Record<RoutineStep, string> = {
  topic: "Choosing a topic",
  plan: "Researching",
  draft: "Writing the article",
  prompt: "Writing the image brief",
  reference: "Finding a photograph",
  images: "Making the cover",
  publish: "Sending to the Hub",
  done: "Finished",
};

/** 1-based position for "step 3 of 7"; 7 once it is done. */
export function stepNumber(step: RoutineStep): number {
  const index = STEP_ORDER.indexOf(step);
  return index === -1 ? STEP_ORDER.length : index + 1;
}
