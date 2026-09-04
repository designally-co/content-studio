"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { routines } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { rescheduleRoutine, runRoutineNow, runningRuns, stepRun } from "@/lib/autopilot/runner";
import { TIME_ZONES, type RoutineScheduleKind } from "@/lib/autopilot/schedule";

/* NOTHING IS RE-EXPORTED FROM THIS FILE. Every export of a "use server" module
   is turned into a callable server reference, type-only exports included, and
   one of those throws "X is not defined" the moment the module is evaluated.
   The shapes these actions return are declared here or imported from a plain
   module. See AGENTS.md. */

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only an administrator can change routines.");
  return user;
}

/** A routine writes and publishes without review, so editing one is admin work. */
const SCHEDULE_KINDS = new Set<RoutineScheduleKind>(["manual", "daily", "weekdays", "weekly"]);

function readForm(formData: FormData) {
  const clamp = (value: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
    const parsed = Number(String(value ?? ""));
    return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
  };
  const kindRaw = String(formData.get("scheduleKind") ?? "manual") as RoutineScheduleKind;
  const zone = String(formData.get("timeZone") ?? "");
  const runAt = String(formData.get("runAt") ?? "09:00").trim();

  return {
    name: String(formData.get("name") ?? "").trim().slice(0, 80) || "Routine",
    enabled: String(formData.get("enabled") ?? "") === "on",
    categoryId: String(formData.get("categoryId") ?? "").trim() || null,
    hubStatus: String(formData.get("hubStatus") ?? "") === "published" ? "published" as const : "draft" as const,
    scheduleKind: SCHEDULE_KINDS.has(kindRaw) ? kindRaw : ("manual" as RoutineScheduleKind),
    // Anything that is not HH:MM becomes 09:00 rather than a stored value the
    // scheduler would have to guess about later.
    runAt: /^\d{1,2}:\d{2}$/.test(runAt) ? runAt : "09:00",
    timeZone: (TIME_ZONES as readonly string[]).includes(zone) ? zone : "Asia/Bangkok",
    weekday: clamp(formData.get("weekday"), 0, 6, 1),
    imagesPerRun: clamp(formData.get("imagesPerRun"), 0, 4, 1),
    // Capped at 5 whatever is submitted: this number's whole job is to be a
    // ceiling a mistake cannot spend past, so it needs one of its own.
    maxPerDay: clamp(formData.get("maxPerDay"), 1, 5, 1),
  };
}

export async function createRoutineAction(formData: FormData) {
  const user = await requireAdmin();
  const db = await getDb();
  const values = readForm(formData);
  const [created] = await db
    .insert(routines)
    .values({ ...values, createdBy: user.id })
    .returning();
  await rescheduleRoutine(created);
  revalidatePath("/routines");
}

export async function updateRoutineAction(formData: FormData) {
  await requireAdmin();
  const db = await getDb();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Which routine?");
  const values = readForm(formData);
  const [updated] = await db
    .update(routines)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(routines.id, id))
    .returning();
  if (updated) await rescheduleRoutine(updated);
  revalidatePath("/routines");
}

/** Switch one routine on or off without opening its form. */
export async function toggleRoutineAction(id: string, enabled: boolean) {
  await requireAdmin();
  const db = await getDb();
  const [updated] = await db
    .update(routines)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(routines.id, id))
    .returning();
  if (updated) await rescheduleRoutine(updated);
  revalidatePath("/routines");
}

export async function deleteRoutineAction(id: string) {
  await requireAdmin();
  const db = await getDb();
  // Its runs go with it (the foreign key cascades), but the ARTICLES do not:
  // `routine_runs.project_id` is ON DELETE SET NULL in the other direction, and
  // nothing here touches `projects`. Deleting a schedule must never delete work
  // it produced.
  await db.delete(routines).where(eq(routines.id, id));
  revalidatePath("/routines");
}

export type StartedRun = { ok: true; runId: string } | { ok: false; message: string };

/**
 * Start a routine now.
 *
 * Returns its failure rather than throwing it: a thrown server-action error is
 * redacted in production, so "no active content direction" would reach the
 * screen as "an unexpected response was received from the server".
 */
export async function runRoutineNowAction(routineId: string): Promise<StartedRun> {
  await requireAdmin();
  try {
    const { runId } = await runRoutineNow(routineId);
    revalidatePath("/routines");
    return { ok: true, runId };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "The routine could not start.",
    };
  }
}

export type StepReport = {
  ok: boolean;
  runId: string;
  step: string;
  status: string;
  busy?: boolean;
  message?: string;
};

/**
 * Advance a run by one step, for a browser that is watching it.
 *
 * The page calls this in a loop. That is the whole trick behind Run now: the
 * open tab is the timer, so a manual run finishes in a few minutes instead of
 * waiting for the next tick, and every step is still one request with its own
 * sixty seconds.
 */
export async function stepRunAction(runId: string): Promise<StepReport> {
  await requireAdmin();
  try {
    const outcome = await stepRun(runId);
    if (outcome.status !== "running") revalidatePath("/routines");
    return {
      ok: true,
      runId: outcome.runId,
      step: outcome.step,
      status: outcome.status,
      busy: outcome.busy,
      message: outcome.error,
    };
  } catch (cause) {
    return {
      ok: false,
      runId,
      step: "unknown",
      status: "failed",
      message: cause instanceof Error ? cause.message : "The step failed.",
    };
  }
}

export type LiveRun = {
  id: string;
  routineId: string;
  projectId: string | null;
  step: string;
  title: string;
};

/**
 * What is running right now.
 *
 * Polled by the page while anything is in flight. Deliberately the cheapest
 * query in this file — one indexed read and a join — because it runs every few
 * seconds for as long as somebody is watching.
 */
export async function liveRunsAction(): Promise<LiveRun[]> {
  await requireUser();
  const rows = await runningRuns();
  return rows.map((row) => ({
    id: row.id,
    routineId: row.routineId,
    projectId: row.projectId,
    step: row.step,
    title: (row.title as { title?: string } | null)?.title ?? "Untitled article",
  }));
}
