import "server-only";
import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, projects, routineRuns, routines } from "@/db/schema";
import type { ProjectInputs, RoutineStep } from "@/db/schema";
import { generateTopicIdeas } from "@/lib/pipeline/topics";
import { preparePlanCore } from "@/lib/pipeline/plan";
import { generateDraftCore } from "@/lib/pipeline/draft";
import { generateImagePromptCore } from "@/lib/pipeline/image-prompt";
import { findReferenceImagesCore, generateImagesCore } from "@/lib/pipeline/images";
import { publishToHubCore } from "@/lib/pipeline/publish";
import { imageGenerationOptions } from "@/lib/image/registry";
import { isHubConfigured } from "@/lib/hub";
import { isAnthropicConfigured } from "@/lib/anthropic";

/**
 * The autopilot: one article, written and published without an editor.
 *
 * The shape of this file is decided by one constraint. A full article is five
 * model-and-provider steps taking two to three minutes, and a serverless
 * function gets sixty seconds. So the run cannot be a loop — it is a state
 * machine whose position lives in the database, advanced ONE step per request
 * by whatever pokes the endpoint. That is also what makes a crashed run
 * resumable rather than lost: the row still says where it got to.
 *
 * Each step is one of the same functions an editor's click calls, imported from
 * `@/lib/pipeline/*`. Nothing here re-implements generation. If the manual
 * pipeline changes, the autopilot changes with it, which is the only way two
 * paths to the same artefact stay honest about each other.
 */

/** Not the function's own ceiling — the caller's, less room to record the outcome. */
const STEP_BUDGET_MS = 50_000;

/**
 * How long a claimed run is off-limits to another worker.
 *
 * Longer than any single step, so two pokes arriving together cannot both
 * advance the same run. Short enough that a worker killed mid-step releases it
 * by expiry rather than wedging it forever — which is why this is a timestamp
 * and not a boolean.
 */
const CLAIM_MS = 3 * 60_000;

/** After this many failures at the same step, stop and leave the error visible. */
const MAX_ATTEMPTS = 3;

/**
 * How many times a day the autopilot may fail to even begin an article before
 * it stops trying. A start that fails costs a topic request and nothing else,
 * so a few retries are worth having when a provider is briefly unwell; a poke
 * every ten minutes all day is not.
 */
const FAILED_STARTS_PER_DAY = 5;

export type TickReport = {
  started: number;
  advanced: { runId: string; from: RoutineStep; to: RoutineStep | "failed" }[];
  idle: boolean;
  note?: string;
};

/** The single schedule, created on first use so there is nothing to set up. */
export async function getRoutine() {
  const db = await getDb();
  const [existing] = await db.select().from(routines).orderBy(asc(routines.createdAt)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(routines).values({}).returning();
  return created;
}

/** Midnight UTC — the line both of the day's counts are drawn from. */
function startOfDay(): Date {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

/**
 * Articles opened today — what `maxPerDay` is counted against.
 *
 * Only runs that got as far as a project. A run that died before one existed
 * never cost anything but a failed topic request, and counting those here would
 * mean a provider hiccup at one minute past midnight silently costs the whole
 * day's publishing. The `failedStartsToday` ceiling below is what stops those
 * from retrying forever instead.
 */
async function runsToday(routineId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(routineRuns)
    .where(
      and(
        eq(routineRuns.routineId, routineId),
        gte(routineRuns.startedAt, startOfDay()),
        isNotNull(routineRuns.projectId)
      )
    );
  return row?.n ?? 0;
}

/** Starts that failed before an article existed, today. */
async function failedStartsToday(routineId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(routineRuns)
    .where(
      and(
        eq(routineRuns.routineId, routineId),
        gte(routineRuns.startedAt, startOfDay()),
        isNull(routineRuns.projectId)
      )
    );
  return row?.n ?? 0;
}

/**
 * Take exclusive hold of ONE unfinished run.
 *
 * Written as raw SQL because the shape matters and an ORM update cannot express
 * it. `UPDATE ... WHERE status = 'running'` has no row limit — it would claim
 * every run in flight at once, lock them all for the claim window, and then
 * advance exactly one. The rest would sit untouched until the lock expired.
 *
 * So the row is chosen by a subquery with `LIMIT 1`, and `FOR UPDATE SKIP
 * LOCKED` is what makes two workers arriving together take different rows
 * instead of queueing behind the same one. `locked_until` still earns its place
 * on top of that: the row lock lasts only as long as the transaction, while the
 * claim has to outlive it and survive a worker that dies mid-step — which it
 * does by expiring rather than by needing cleanup.
 */
async function claimRun() {
  const db = await getDb();
  const claimMs = CLAIM_MS;
  const result = await db.execute(sql`
    update routine_runs set
      locked_until = now() + (${claimMs} || ' milliseconds')::interval,
      updated_at = now()
    where id = (
      select id from routine_runs
      where status = 'running'
        and (locked_until is null or locked_until < now())
      order by started_at asc
      limit 1
      for update skip locked
    )
    returning *
  `);
  // postgres-js returns the rows directly; PGlite wraps them in `.rows`.
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  // Raw SQL returns snake_case; the rest of this file speaks the schema's names.
  return {
    id: String(row.id),
    routineId: String(row.routine_id),
    projectId: row.project_id ? String(row.project_id) : null,
    step: row.step as RoutineStep,
    attempts: Number(row.attempts ?? 0),
  };
}

/** The direction this run writes about — the chosen one, or the next in rotation. */
async function pickCategory(routineCategoryId: string | null, runCount: number) {
  const db = await getDb();
  if (routineCategoryId) {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, routineCategoryId), eq(categories.active, true)))
      .limit(1);
    if (row) return row;
  }
  const active = await db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  if (active.length === 0) return null;
  // Rotate rather than repeat: an unattended schedule pointed at one direction
  // publishes the same corner of the territory every day.
  return active[runCount % active.length];
}

/**
 * Begin a run: choose a direction, ask for topics, and open a project on the
 * first one. Creating the project here rather than in the `topic` step keeps
 * every later step addressable by `projectId` alone.
 */
async function startRun(routine: Awaited<ReturnType<typeof getRoutine>>) {
  const db = await getDb();
  const total = await runsToday(routine.id);
  const category = await pickCategory(routine.categoryId, total);
  if (!category) throw new Error("No active content direction to write about.");

  const ideas = await generateTopicIdeas({
    categoryId: category.id,
    categoryName: category.name,
    language: "en",
  });
  const idea = ideas[0];
  if (!idea) throw new Error("No topic idea came back for this direction.");

  const inputs: ProjectInputs = {
    articleMode: "editorial",
    editorialFormat: "explainer",
    editorialReader: "Designers and creative teams",
    editorialEntryCount: 10,
  };
  const [project] = await db
    .insert(projects)
    .values({
      categoryId: idea.directionId || category.id,
      language: "en",
      status: "draft",
      stage: 3,
      inputs,
      selectedTopic: {
        title: idea.title,
        angle: idea.angle,
        whyTimely: idea.whyTimely,
        searchIntent: idea.searchIntent,
        researchSources: idea.researchSources,
        source: "suggested",
      },
      createdBy: routine.createdBy,
    })
    .returning();

  const [run] = await db
    .insert(routineRuns)
    .values({ routineId: routine.id, projectId: project.id, step: "plan", status: "running" })
    .returning();
  await db.update(routines).set({ lastRunAt: new Date() }).where(eq(routines.id, routine.id));
  return run;
}

/** Generate one image and leave it on the project for publishing to pick up. */
async function runImageStep(projectId: string, count: number) {
  const options = await imageGenerationOptions();
  if (options.length === 0) {
    // Not fatal. An article without a cover is still an article, and stopping
    // the whole run over a missing Fal key would be the wrong trade.
    return;
  }
  // Draft the prompt first: the reference search uses the scene phrase the brief
  // writes, and searching before there is a brief finds pictures of the topic
  // rather than of the situation.
  const drafted = await generateImagePromptCore(projectId, { variationCount: count });
  const found = await findReferenceImagesCore(projectId, {
    query: drafted.brief.photoQuery,
  });
  const reference = found.references[0];

  // With a photograph attached the editing endpoint is the only one that can
  // read it, exactly as the stage switches models when an editor presses Find.
  const option =
    (reference && options.find((o) => o.capabilities.referenceImages)) ?? options[0];
  const withReference = Boolean(reference) && option.capabilities.referenceImages;

  // The prompt is re-drafted once the reference exists, so the brief has
  // actually seen the photograph it is being told to match.
  const finalPrompt = withReference
    ? await generateImagePromptCore(projectId, { variationCount: count, referenceId: reference.id })
    : drafted;

  await generateImagesCore(projectId, {
    prompt: finalPrompt.prompt,
    optionId: option.optionId,
    aspectRatio: "16:9",
    variationCount: Math.max(1, Math.min(count, option.capabilities.maxVariations)),
    referenceIds: withReference ? [reference.id] : [],
    variantPrompts: finalPrompt.variants.map((v) => v.prompt),
  });
}

/** Advance one run by exactly one step. */
type ClaimedRun = NonNullable<Awaited<ReturnType<typeof claimRun>>>;

async function advance(run: ClaimedRun, routine: Awaited<ReturnType<typeof getRoutine>>) {
  const db = await getDb();
  const projectId = run.projectId;
  if (!projectId) throw new Error("This run has no article attached.");

  let next: RoutineStep = run.step;
  switch (run.step) {
    case "plan":
      await preparePlanCore(projectId);
      next = "draft";
      break;
    case "draft":
      await generateDraftCore(projectId);
      next = "images";
      break;
    case "images":
      // Zero means the article goes out without a cover, and it has to mean
      // that here: the generator clamps its own count to at least one, so
      // skipping the step is the only way to actually ask for no image.
      if (routine.imagesPerRun > 0) await runImageStep(projectId, routine.imagesPerRun);
      next = "publish";
      break;
    case "publish":
      await publishToHubCore(projectId, routine.hubStatus);
      next = "done";
      break;
    default:
      next = "done";
  }

  const done = next === "done";
  await db
    .update(routineRuns)
    .set({
      step: next,
      status: done ? "done" : "running",
      // Released immediately: the next step should be picked up by the next
      // poke rather than waiting out a lock that is no longer protecting work.
      lockedUntil: null,
      attempts: 0,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(routineRuns.id, run.id));
  return next;
}

/** Record a failed step, and stop the run once it has failed enough times. */
async function recordFailure(run: ClaimedRun, cause: unknown) {
  const db = await getDb();
  const attempts = run.attempts + 1;
  const message = cause instanceof Error ? cause.message : String(cause);
  const exhausted = attempts >= MAX_ATTEMPTS;
  await db
    .update(routineRuns)
    .set({
      attempts,
      // Truncated, because a provider error can carry a whole response body and
      // this column is read in a list.
      error: message.slice(0, 500),
      status: exhausted ? "failed" : "running",
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(routineRuns.id, run.id));
  return exhausted;
}

/**
 * One poke: advance whatever is in flight, and start a run if one is due.
 *
 * Advancing comes first. A run already part-way through has spent money on
 * research and drafting, and finishing it matters more than beginning another.
 */
export async function tick(): Promise<TickReport> {
  const startedAt = Date.now();
  const report: TickReport = { started: 0, advanced: [], idle: true };

  const routine = await getRoutine();
  if (!routine.enabled) return { ...report, note: "Autopilot is switched off." };
  if (!(await isAnthropicConfigured())) {
    return { ...report, note: "ANTHROPIC_API_KEY is not set — nothing can be written." };
  }

  // As many steps as the budget allows: a poke every few minutes would
  // otherwise take a quarter of an hour to finish one article.
  while (Date.now() - startedAt < STEP_BUDGET_MS) {
    const run = await claimRun();
    if (!run) break;
    report.idle = false;
    try {
      const to = await advance(run, routine);
      report.advanced.push({ runId: run.id, from: run.step, to });
    } catch (cause) {
      const exhausted = await recordFailure(run, cause);
      report.advanced.push({ runId: run.id, from: run.step, to: exhausted ? "failed" : run.step });
      // Stop this poke rather than spin: whatever failed is likely to fail
      // again inside the same few seconds.
      break;
    }
  }

  if (report.idle) {
    const total = await runsToday(routine.id);
    if (total >= routine.maxPerDay) {
      return { ...report, note: `Today's limit of ${routine.maxPerDay} is already used.` };
    }
    if ((await failedStartsToday(routine.id)) >= FAILED_STARTS_PER_DAY) {
      return {
        ...report,
        note: "Too many runs failed to start today — see the history. It will try again tomorrow.",
      };
    }
    if (routine.hubStatus === "published" && !isHubConfigured()) {
      return { ...report, note: "HUB_BASE_URL or HUB_API_KEY is not set — nothing could be published." };
    }
    try {
      await startRun(routine);
      report.started = 1;
      report.idle = false;
    } catch (cause) {
      const db = await getDb();
      await db.insert(routineRuns).values({
        routineId: routine.id,
        step: "topic",
        status: "failed",
        attempts: MAX_ATTEMPTS,
        error: (cause instanceof Error ? cause.message : String(cause)).slice(0, 500),
      });
      return { ...report, note: "Could not start a run — see the history." };
    }
  }

  return report;
}

/** The most recent runs, for the Settings page. */
export async function recentRuns(limit = 20) {
  const db = await getDb();
  return db
    .select({
      id: routineRuns.id,
      projectId: routineRuns.projectId,
      step: routineRuns.step,
      status: routineRuns.status,
      error: routineRuns.error,
      startedAt: routineRuns.startedAt,
      updatedAt: routineRuns.updatedAt,
      title: projects.selectedTopic,
      publishedTo: projects.publishedTo,
    })
    .from(routineRuns)
    .leftJoin(projects, eq(projects.id, routineRuns.projectId))
    .orderBy(desc(routineRuns.startedAt))
    .limit(limit);
}
