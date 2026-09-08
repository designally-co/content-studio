import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { listRoutines, recentRuns, runningRuns } from "@/lib/autopilot/runner";
import type { RoutineView, RunView } from "@/lib/autopilot/views";
import { isHubConfigured } from "@/lib/hub";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { requireUser } from "@/lib/session";
import { RoutinesBoard } from "./routines-board";

export const dynamic = "force-dynamic";

/**
 * Routines: schedules that write and publish an article on their own.
 *
 * Administrators only. This page hands out the ability to publish to a live
 * site with nobody reading the result first, which is a stronger reason to gate
 * it than any other screen in the app has.
 */
export default async function RoutinesPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const db = await getDb();
  const [rows, runs, inFlight, directions, anthropicReady] = await Promise.all([
    listRoutines(),
    recentRuns(60),
    runningRuns(),
    db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name)),
    isAnthropicConfigured(),
  ]);

  const directionName = new Map(directions.map((row) => [row.id, row.name]));

  const routines: RoutineView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    categoryId: row.categoryId,
    directionName: row.categoryId ? (directionName.get(row.categoryId) ?? null) : null,
    hubStatus: row.hubStatus,
    imagesPerRun: row.imagesPerRun,
    maxPerDay: row.maxPerDay,
    scheduleKind: row.scheduleKind,
    runAt: row.runAt,
    timeZone: row.timeZone,
    weekday: row.weekday,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
  }));

  const history: RunView[] = runs.map((run) => ({
    id: run.id,
    routineId: run.routineId,
    projectId: run.projectId,
    step: run.step,
    status: run.status,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    title: (run.title as { title?: string } | null)?.title ?? "Untitled article",
    hubUrl: (run.publishedTo as Record<string, string> | null)?.knowledgeHub ?? null,
  }));

  return (
    <div className="min-h-svh bg-sunken">
      {/* No header band. It ran the width of the screen above a column of
          cards half that wide, so the page had two left edges and the title
          belonged to neither. The heading sits on the list's own column now,
          and scrolls with it. */}
      <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <RoutinesBoard
          routines={routines}
          history={history}
          directions={directions.map((row) => ({ id: row.id, name: row.name }))}
          anthropicReady={anthropicReady}
          hubReady={isHubConfigured()}
          cronReady={Boolean(process.env.CRON_SECRET)}
          /* Handed over on the first render so a run already in flight is
             visible immediately, and this page starts moving it along without
             waiting a poll for permission to notice it. */
          initialLive={inFlight.map((run) => ({
            id: run.id,
            routineId: run.routineId,
            projectId: run.projectId,
            step: run.step,
            title: (run.title as { title?: string } | null)?.title ?? "Untitled article",
          }))}
        />
      </div>
    </div>
  );
}
