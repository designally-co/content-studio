"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, drafts } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject, pipelineContext } from "@/lib/projects";
import { loadStoredImage } from "@/lib/image/storage";
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
import { IMAGE_SYSTEM_PROMPT } from "@/prompts/system";
import {
  MAX_PROMPT_VARIANTS,
  finishImagePrompt,
  type ArticleVisualBrief,
  type DraftedImagePrompt,
  type ImagePromptVariant,
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
  imageContext?: { variationCount?: number }
): Promise<DraftedImagePrompt> {
  const loaded = await ctxFor(projectId);
  const { drafting } = await getModels();
  const selected = loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0];
  const article = selected?.contentMd.trim() ?? "";
  if (!article) throw new Error("No finished article is available for image planning.");
  const articleTitle = article.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = articleTitle || loaded.project.selectedTopic?.title || "Untitled";

  const requestedVariants = Number(imageContext?.variationCount ?? 1);
  const variantCount = Number.isFinite(requestedVariants)
    ? Math.min(Math.max(Math.floor(requestedVariants), 1), MAX_PROMPT_VARIANTS)
    : 1;

  /*
   * Show the prompt writer the photograph it is being asked to match.
   *
   * Without this, "match the reference" was an instruction with nothing behind
   * it: the writer knew a photograph existed but never what was in it, so it
   * invented a scene from the article and the reference reached only the image
   * model. One image on this call is enough — the brief records what it sees in
   * `referenceScene`, and every prompt call reads that.
   */
  const reference = loaded.imageReferences[0];
  const referenceImage = await (async () => {
    if (!reference) return undefined;
    const stored = await loadStoredImage(reference.storagePath);
    if (!stored) return undefined;
    return [{ base64: stored.data.toString("base64"), mediaType: stored.mimeType }];
  })();
  const hasReferenceImage = Boolean(referenceImage);

  const { data: brief } = await runJson<ArticleVisualBrief>({
    model: drafting,
    // NOT buildSystemPrompt: that carries the brand's voice, terminology and
    // guidelines, which dressed every article's image in the publisher's own
    // identity. See IMAGE_SYSTEM_PROMPT.
    system: IMAGE_SYSTEM_PROMPT,
    task: articleVisualBriefTask({
      title,
      article: article.slice(0, 24000),
      hasReferenceImage,
      variantCount,
    }),
    images: referenceImage,
    schema: {
      type: "object",
      properties: {
        referenceScene: { type: "string" },
        scene: { type: "string" },
        alternateScenes: { type: "array", items: { type: "string" } },
        photoQuery: { type: "string" },
      },
      required: ["referenceScene", "scene", "alternateScenes", "photoQuery"],
      additionalProperties: false,
    },
    maxTokens: 1200,
    projectId,
    stage: "image_visual_brief",
  });

  /*
   * One prompt per image, each showing a different moment.
   *
   * A single prompt sent N times gave N samples of one picture, differing only
   * where the sampler wandered — no choice at all for an editor picking a
   * cover. The calls run in parallel, so wall time stays that of one: this
   * action lives inside the page's 60s `maxDuration` and four in sequence would
   * not fit. Only the count actually asked for is written.
   */
  const scenes = [brief.scene, ...(brief.alternateScenes ?? [])]
    .map((scene) => scene.trim())
    .filter((scene) => scene.length > 0)
    .slice(0, variantCount);
  if (scenes.length === 0) scenes.push(brief.scene);

  // Image prompts must be English — the Fal models are English-trained.
  // Enforced in the prompt AND here: if Thai leaks in, retry once with an
  // explicit instruction, then reject rather than send a non-English prompt.
  const writeVariant = async (scene: string, index: number): Promise<ImagePromptVariant> => {
    const taskText = imagePromptTask({
      title,
      visualBrief: brief,
      scene,
      variantNo: index + 1,
      variantCount: scenes.length,
      siblingScenes: scenes.filter((_, other) => other !== index),
      hasReferenceImage,
    });
    const run = (extra?: string) =>
      runText({
        model: drafting,
        system: IMAGE_SYSTEM_PROMPT,
        task: extra ? `${taskText}\n\n${extra}` : taskText,
        maxTokens: 650,
        projectId,
        stage: "image_prompt",
      });

    let written = (await run()).text.trim();
    if (containsThai(written)) {
      written = (
        await run("The previous image prompt contained Thai characters. Rewrite it entirely in English — no Thai, no other non-English script.")
      ).text.trim();
      if (containsThai(written)) {
        throw new SchemaValidationError("image_prompt", "image prompt must be English (Thai characters found)");
      }
    }
    return { scene, prompt: finishImagePrompt(written) };
  };

  const settled = await Promise.allSettled(scenes.map(writeVariant));
  const variants = settled
    .filter((result): result is PromiseFulfilledResult<ImagePromptVariant> => result.status === "fulfilled")
    .map((result) => result.value);
  // One prompt is the minimum this action can honestly return. Losing a later
  // variant costs a choice; losing them all is a failure, and the first
  // rejection says why.
  if (variants.length === 0) {
    const failed = settled.find((result) => result.status === "rejected");
    throw failed && failed.status === "rejected" ? failed.reason : new Error("No image prompt was written.");
  }

  return { prompt: variants[0].prompt, brief, variants };
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
