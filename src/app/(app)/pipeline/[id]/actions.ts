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
