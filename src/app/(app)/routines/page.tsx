import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { listRoutines, recentRuns } from "@/lib/autopilot/runner";
import type { RoutineView, RunView } from "@/lib/autopilot/views";
import { isHubConfigured } from "@/lib/hub";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
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
  const [rows, runs, directions, anthropicReady] = await Promise.all([
    listRoutines(),
    recentRuns(60),
    db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name)),
    isAnthropicConfigured(),
  ]);

  const directionName = new Map(directions.map((row) => [row.id, row.name]));

  const routines: RoutineView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
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
      <PageHeader
        title="Routines"
        description="A routine writes one article on its own — topic, research, draft, cover image — and sends it to the Knowledge Hub. Nobody reviews it on the way."
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <RoutinesBoard
          routines={routines}
          history={history}
          directions={directions.map((row) => ({ id: row.id, name: row.name }))}
          anthropicReady={anthropicReady}
          hubReady={isHubConfigured()}
          cronReady={Boolean(process.env.CRON_SECRET)}
        />
      </div>
    </div>
  );
}
