import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { loadProject, pipelineContext } from "@/lib/projects";
import { getModels, buildResearchSystem, runJson } from "@/lib/anthropic";
import { editorialArticlePlanTask } from "@/prompts/tasks";
import { outlineToMarkdown, type OutlineJson } from "@/lib/outline";
import { pillarForDirection } from "@/lib/content-pillars";

/**
 * The research-plan step, with no session check.
 *
 * It lives here rather than in the stage's `"use server"` module for a reason
 * that is easy to get wrong: EVERY exported async function in a `"use server"`
 * file is a callable endpoint. Exporting an auth-free core from there would
 * publish it to anyone who can reach the app. So the core sits in a plain
 * server-only module; the action imports it behind `requireUser()`, and the
 * autopilot runner imports it behind its own shared-secret check.
 *
 * Two callers, one implementation — the alternative is a second copy of
 * "research this article", and two copies drift apart inside a month.
 */

/*
 * NO WEB SEARCH HERE. It does not fit, and this is the end of a long argument
 * with the clock rather than the start of another one.
 *
 * Measured locally against the real API, Haiku 4.5, with this plan's schema:
 *
 *     with one web search   36.4s
 *     without web search    18.6s
 *
 * Ceilings of 25s, 32s and 42s were all tried. The 42s attempt was watched in
 * production: the call ran to roughly 0:43 on the page's own timer and then
 * reported "Request timed out." Production is slower than the local
 * measurement — the function runs in sin1 and pays cold starts — so a search
 * call cannot be relied on to land inside a 60s function at all, and every
 * ceiling that fit the budget sat under what the call needs.
 *
 * One call, no search, no fallback, ~19s. The task variant used is the one the
 * old fallback used whenever the web tool was unavailable, so the plan states
 * no recency it cannot support rather than inventing it.
 *
 * TO GET SOURCES BACK, the fix is not a bigger number: it is a function that
 * can run longer (a paid plan raises 60s to 300s) or moving the plan to a
 * background job that is not bound by a request timeout.
 */
const PLAN_TIMEOUT_MS = 40_000;

/** Advance the stored stage without moving it backwards. */
async function bumpStage(projectId: string, to: number) {
  const db = await getDb();
  const [row] = await db
    .select({ stage: projects.stage })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.stage >= to) return;
  await db.update(projects).set({ stage: to, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function preparePlanCore(projectId: string): Promise<{ ok: true }> {
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found");
  /* Already planned — a retry after a failed run, or a second visit. Just
     advance and let the caller navigate. This path used to revalidate too,
     which re-rendered the route inside the action's response; a failure there
     reported "The draft did not start" on a project whose outline was sitting
     complete in the database, which is exactly how it looked. */
  if (loaded.project.outline?.markdown.trim()) {
    await bumpStage(projectId, 4);
    return { ok: true };
  }
  const ctx = pipelineContext(loaded);
  const topic = loaded.project.selectedTopic?.source === "brief"
    ? loaded.project.selectedTopic.angle || ctx.inputs.brief || "Creative industry article"
    : loaded.project.selectedTopic?.title || ctx.inputs.brief || loaded.category?.name || "Creative industry article";
  const { research } = await getModels();
  const planPillar = pillarForDirection(loaded.category?.name ?? "");
  const task = editorialArticlePlanTask({
    topic,
    brief: ctx.inputs.brief,
    format: ctx.inputs.editorialFormat,
    period: ctx.inputs.editorialPeriod,
    language: ctx.language,
    seedSources: loaded.project.selectedTopic?.researchSources,
    pillarName: planPillar?.name,
    pillarPurpose: planPillar?.purpose,
  });
  const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        introAngle: { type: "string" },
        sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, points: { type: "array", items: { type: "string" } } }, required: ["heading", "points"], additionalProperties: false } },
        sources: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, whyRelevant: { type: "string" } }, required: ["name", "url", "whyRelevant"], additionalProperties: false } },
        cta: { type: "string" },
      },
      required: ["title", "introAngle", "sections", "sources", "cta"],
      additionalProperties: false,
  };
  /* Source-free by design — see the note on PLAN_TIMEOUT_MS. The task tells
     the writer not to claim current facts it has no source for. */
  const { data } = await runJson<OutlineJson>({
    model: research,
    system: buildResearchSystem(),
    cache: false,
    /* "Leave sources empty" used to be right: this wording was a fallback for
       a search that had already FAILED, so there was genuinely nothing to
       cite. It is now the only path, and that instruction guaranteed every
       article shipped with no references — observed on two articles in a row
       before it was traced back to this line.
       Stable references do not need a live lookup. What a lookup provides is
       currency, so that is what is forbidden here, not citation. */
    task: `${task}\n\nLive web lookup is unavailable for this request. Do not claim anything current: no release dates, version numbers, rankings, popularity, or recent developments you cannot support without checking.\n\nYou may still cite stable, canonical references you are confident exist — official documentation, specifications, standards, and long-established resources. Use canonical URLs and never invent one. If you are not confident a URL is correct, leave that source out: two references that are right beat six that might not be.`,
    schema,
    maxTokens: 3000,
    // The heal retry would double this call; the budget has no room for that.
    allowHeal: false,
    timeoutMs: PLAN_TIMEOUT_MS,
    projectId,
    stage: "article_research_plan",
  });

  const markdown = outlineToMarkdown(data, true);
  const db = await getDb();
  await db.update(projects).set({
    inputs: {
      ...ctx.inputs,
      editorialCandidates: undefined,
      selectedEditorialCandidateIds: undefined,
    },
    outline: { markdown, approved: true },
    stage: Math.max(loaded.project.stage, 4),
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));
  /*
   * NO revalidatePath HERE.
   *
   * The client navigates to ?stage=4 itself the moment this resolves, so
   * revalidating made the route render a SECOND time — inside this action's own
   * response, on top of a call that has already spent up to 42s of the 60s
   * function. A failure in that render surfaces through the caller's catch as
   * "The draft did not start", which is why the outline could be saved and the
   * step still report that it never began. One render, done by the navigation.
   */
  return { ok: true };
}
