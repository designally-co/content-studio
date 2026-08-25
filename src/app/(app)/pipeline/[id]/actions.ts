"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, drafts } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject, pipelineContext } from "@/lib/projects";
import {
  getModels,
  buildSystemPrompt,
  buildResearchSystem,
  isAnthropicConfigured,
  runJson,
  runText,
} from "@/lib/anthropic";
import { SchemaValidationError, containsThai } from "@/lib/ai/schemas";
import {
  imagePromptTask,
  articleVisualBriefTask,
  brandReviewTask,
  editorialReviewTask,
  editorialArticlePlanTask,
} from "@/prompts/tasks";
import { outlineToMarkdown, type OutlineJson } from "@/lib/outline";
import { pillarForDirection } from "@/lib/content-pillars";
import type { BrandReviewResult } from "@/lib/brand-review";
import {
  IMAGE_DIRECTIONS,
  ART_DIRECTION_PRESETS,
  ART_DIRECTION_GUIDE,
  type ArticleVisualBrief,
  type ArtDirectionSelection,
  type DraftedImagePrompt,
  type ImageDirection,
} from "@/lib/image/visual-brief";

async function ctxFor(projectId: string) {
  await requireUser();
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found");
  return loaded;
}

async function bumpStage(projectId: string, to: number) {
  const db = await getDb();
  const loaded = await loadProject(projectId);
  const stage = Math.max(loaded?.project.stage ?? 1, to);
  await db
    .update(projects)
    .set({ stage, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/*
 * MEASURED FOR THIS CALL, not borrowed from another one.
 *
 * Against the real API, Haiku 4.5, with this plan's schema and prompt:
 *
 *     with one web search   36.4s   (1718 output tokens)
 *     without web search    18.6s   (1089 output tokens)
 *
 * The ideas step measures 29.1s with search; this one is heavier — a longer
 * system prompt, 4-8 sections and 4-10 sources. Ceilings of 25s and then 32s
 * were both set below 36.4s, so the call kept aborting itself and the draft
 * "did not start". Reusing a number measured on a different call is what went
 * wrong, twice.
 *
 * Finding topics has to be fast; drafting does not. So the search call gets
 * room to finish — 42s — and nothing is reserved from it up front. The
 * source-free fallback runs only if the primary fails with time to spare,
 * which in practice means an early failure such as a provider error rather
 * than a timeout. After a full-length timeout there is correctly no room, and
 * the real error is raised instead of a dead request.
 *
 * Worst case: 4s setup + 42s = 46s, inside the 60s function.
 */
const PLAN_BUDGET_MS = 60_000;
/** Auth, the project load, settings, the write-back and the response. */
const PLAN_HEADROOM_MS = 6_000;
/** Above the 36.4s a search call needs, not below it. */
const PLAN_SEARCH_MAX_MS = 42_000;
/** A source-free plan measures 18.6s, so its ceiling sits above that too. */
const PLAN_FALLBACK_MAX_MS = 22_000;
const PLAN_FALLBACK_MIN_MS = 22_000;

/**
 * Returns its failure instead of throwing it.
 *
 * A thrown error in a Server Action is redacted in production — the caller
 * receives "An error occurred in the Server Components render", which says
 * nothing about which step failed or why. Three rounds of this were debugged
 * from Vercel logs that the person hitting the button should not have needed to
 * open. A returned string is data, and reaches the screen intact.
 */
export async function prepareSimpleArticleAction(
  projectId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    return await preparePlan(projectId);
  } catch (reason) {
    return {
      ok: false,
      message: reason instanceof Error ? reason.message : "Could not prepare the draft.",
    };
  }
}

async function preparePlan(projectId: string): Promise<{ ok: true }> {
  const loaded = await ctxFor(projectId);
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
  /*
   * MEASURED, NOT GUESSED. Against the real API with this request shape,
   * Haiku 4.5 takes ~29s with one web search and ~13s without — a search is a
   * round trip inside the model's turn and costs about 16 seconds.
   *
   * This step used to give the primary 25s, BELOW what a search call needs, so
   * it timed out almost every time; the fallback then ran for another 25s and
   * the pair overran the 60s function. That is "The draft did not start".
   *
   * The two calls now share one deadline instead of each holding an
   * independent ceiling, sized from those measurements. Research still runs —
   * an outline with sources is worth the wait here in a way it was not for the
   * idea list — but it can no longer take the fallback down with it.
   */
  const startedAt = Date.now();
  const msLeft = () => PLAN_BUDGET_MS - PLAN_HEADROOM_MS - (Date.now() - startedAt);

  let data: OutlineJson;
  try {
    ({ data } = await runJson<OutlineJson>({
      model: research,
      system: buildResearchSystem(),
      cache: false,
      task,
      schema,
      // Roomy on purpose: truncation triggers the heal retry in
      // lib/anthropic.ts, which silently doubles the call. Headroom is free.
      maxTokens: 3000,
      // No heal. It would double a 32s call to 64s and blow the function; the
      // budget above has no room for that, and 3000 tokens is roughly twice
      // what an outline needs, so truncation should not arise anyway.
      allowHeal: false,
      webSearch: { maxUses: 1 },
      timeoutMs: Math.min(PLAN_SEARCH_MAX_MS, msLeft()),
      projectId,
      stage: "article_research_plan",
    }));
  } catch (researchError) {
    // Research must improve a draft, never prevent one. If the provider's web
    // tool is slow or unavailable, build a conservative source-free plan and
    // let the writer avoid unsupported current claims — but only while there
    // is still time to return one. Starting a call that cannot finish turns a
    // readable error into a dead request.
    const left = msLeft();
    if (left < PLAN_FALLBACK_MIN_MS) throw researchError;
    ({ data } = await runJson<OutlineJson>({
      model: research,
      system: buildResearchSystem(),
      cache: false,
      task: `${task}\n\nLive source lookup is unavailable. Return a conservative plan now. Leave sources empty and avoid unsupported claims about popularity, release dates, rankings, or current trends.`,
      schema,
      maxTokens: 2400,
      allowHeal: false,
      timeoutMs: Math.min(PLAN_FALLBACK_MAX_MS, left),
      projectId,
      stage: "article_plan_fallback",
    }));
  }
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

export async function goToFinalizeAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  await bumpStage(projectId, 6);
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=6`);
}

// ---- Stage 6: image prompt + finalize ----
export async function generateImagePromptAction(
  projectId: string,
  imageContext?: { model?: string; aspectRatio?: string; hasReferenceImage?: boolean; direction?: ImageDirection; artDirection?: ArtDirectionSelection }
): Promise<DraftedImagePrompt> {
  const loaded = await ctxFor(projectId);
  const ctx = pipelineContext(loaded);
  const { drafting } = await getModels();
  const selected = loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0];
  const article = selected?.contentMd.trim() ?? "";
  if (!article) throw new Error("No finished article is available for image planning.");
  const articleTitle = article.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = articleTitle || loaded.project.selectedTopic?.title || "Untitled";
  const requestedDirection = imageContext?.direction;
  const direction = IMAGE_DIRECTIONS.some((option) => option.value === requestedDirection)
    ? requestedDirection as ImageDirection
    : "auto";
  const requestedArtDirection = imageContext?.artDirection;
  // Designally house style is the official default when none is explicitly chosen.
  const artDirection = ART_DIRECTION_PRESETS.some((option) => option.value === requestedArtDirection)
    ? requestedArtDirection as ArtDirectionSelection
    : "designally_ci";
  const hasReferenceImage = Boolean(imageContext?.hasReferenceImage);

  const { data: brief } = await runJson<ArticleVisualBrief>({
    model: drafting,
    system: buildSystemPrompt(ctx),
    task: articleVisualBriefTask({
      title,
      article: article.slice(0, 24000),
      direction,
      artDirection,
      hasReferenceImage,
    }),
    schema: {
      type: "object",
      properties: {
        articleType: { type: "string", enum: ["typography", "ux_ui", "tools", "design_principles", "branding", "websites", "trend", "other"] },
        articleStructure: { type: "string", enum: ["roundup", "resources", "releases", "comparison", "explainer", "profile", "trend"] },
        artDirection: { type: "string", enum: ["abstract_insight", "metaphorical_editorial", "editorial_studio", "retro_futurist", "tactile_flat_lay", "interface_showcase", "designally_ci"] },
        artDirectionReason: { type: "string" },
        imageRole: { type: "string" },
        mainSubject: { type: "string" },
        namedSubjects: { type: "array", items: { type: "string" } },
        visualCharacteristics: { type: "array", items: { type: "string" } },
        composition: { type: "string" },
        mood: { type: "string" },
        mustInclude: { type: "array", items: { type: "string" } },
        mustAvoid: { type: "array", items: { type: "string" } },
        referenceGuidance: { type: "string" },
      },
      required: ["articleType", "articleStructure", "artDirection", "artDirectionReason", "imageRole", "mainSubject", "namedSubjects", "visualCharacteristics", "composition", "mood", "mustInclude", "mustAvoid", "referenceGuidance"],
      additionalProperties: false,
    },
    maxTokens: 1800,
    projectId,
    stage: "image_visual_brief",
  });

  // Image prompts must be English — the Fal models are English-trained.
  // Enforced in the prompt AND here: if Thai leaks in, retry once with an
  // explicit instruction, then reject rather than send a non-English prompt.
  const imagePromptTaskText = imagePromptTask({
    title,
    visualBrief: brief,
    direction,
    model: imageContext?.model?.slice(0, 100),
    aspectRatio: imageContext?.aspectRatio?.slice(0, 10),
    hasReferenceImage,
  });
  const runImagePrompt = (extra?: string) =>
    runText({
      model: drafting,
      system: buildSystemPrompt(ctx),
      task: extra ? `${imagePromptTaskText}\n\n${extra}` : imagePromptTaskText,
      maxTokens: 650,
      projectId,
      stage: "image_prompt",
    });

  let generatedPrompt = (await runImagePrompt()).text.trim();
  if (containsThai(generatedPrompt)) {
    generatedPrompt = (
      await runImagePrompt("The previous image prompt contained Thai characters. Rewrite it entirely in English — no Thai, no other non-English script.")
    ).text.trim();
    if (containsThai(generatedPrompt)) {
      throw new SchemaValidationError("image_prompt", "image prompt must be English (Thai characters found)");
    }
  }
  // No fixed brand palette — color is left to the article, art direction, and
  // the brief's mood/visual characteristics so images can be expressive.
  const prompt = `${generatedPrompt}\n\nArt direction: ${ART_DIRECTION_GUIDE[brief.artDirection]} Central visible subject: ${brief.mainSubject}. Must include: ${brief.mustInclude.join(", ") || brief.mainSubject}. Avoid: ${brief.mustAvoid.join(", ") || "unrelated generic imagery"}.`;
  return { prompt, brief };
}

export async function reviewBrandAlignmentAction(projectId: string): Promise<BrandReviewResult> {
  const loaded = await ctxFor(projectId);
  const selected = loaded.drafts.find((draft) => draft.isSelected) ?? loaded.drafts[0];
  if (!selected?.contentMd.trim()) throw new Error("No article is available to review.");
  if (!(await isAnthropicConfigured())) throw new Error("Anthropic is not configured.");

  const { drafting } = await getModels();
  const { data } = await runJson<BrandReviewResult>({
    model: drafting,
    system: buildSystemPrompt(pipelineContext(loaded)),
    task: loaded.project.inputs.articleMode === "editorial"
      ? editorialReviewTask(selected.contentMd)
      : brandReviewTask(selected.contentMd),
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterion: { type: "string" },
              status: { type: "string", enum: ["aligned", "review"] },
              finding: { type: "string" },
              suggestion: { type: "string" },
            },
            required: ["criterion", "status", "finding", "suggestion"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "checks"],
      additionalProperties: false,
    },
    maxTokens: 2400,
    projectId,
    stage: "brand_review",
  });
  return data;
}

/**
 * Persist edited article text back to the selected draft (block-editor autosave
 * on the Finalize step). No revalidate — the client holds the editing state.
 */
export async function saveDraftContentAction(
  draftId: string,
  contentMd: string,
  preservePrevious = false,
  revisionLabel = "Manual edit"
) {
  await requireUser();
  const db = await getDb();
  if (preservePrevious) {
    const [current] = await db.select().from(drafts).where(eq(drafts.id, draftId)).limit(1);
    if (current?.contentMd.trim() && current.contentMd !== contentMd) {
      const { refinements } = await import("@/db/schema");
      await db.insert(refinements).values({
        projectId: current.projectId,
        draftId,
        userMessage: revisionLabel.slice(0, 200),
        resultMd: current.contentMd,
      });
    }
  }
  await db.update(drafts).set({ contentMd }).where(eq(drafts.id, draftId));
}
