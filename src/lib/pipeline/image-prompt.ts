import "server-only";
import { getModels, runJson, runText } from "@/lib/anthropic";
import { loadProject } from "@/lib/projects";
import { loadStoredImage } from "@/lib/image/storage";
import { SchemaValidationError, containsThai } from "@/lib/ai/schemas";
import { imagePromptTask, articleVisualBriefTask } from "@/prompts/tasks";
import { IMAGE_SYSTEM_PROMPT } from "@/prompts/system";
import {
  MAX_PROMPT_VARIANTS,
  finishImagePrompt,
  type ArticleVisualBrief,
  type DraftedImagePrompt,
  type ImagePromptVariant,
} from "@/lib/image/visual-brief";

/**
 * Writing the image prompts, with no session check.
 *
 * Out of the stage's `"use server"` module because every exported async
 * function in one is a callable endpoint. The stage's action imports this
 * behind `requireUser()`; the autopilot runner imports it behind its own
 * shared-secret check.
 */

// ---- Stage 6: image prompt + finalize ----
export async function generateImagePromptCore(
  projectId: string,
  imageContext?: {
    variationCount?: number;
    /** Which attached photograph to match. Defaults to the first. */
    referenceId?: string;
  }
): Promise<DraftedImagePrompt> {
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found");
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
  // The one the editor chose, not simply the first — otherwise the brief would
  // describe one photograph while generation matched another.
  const reference =
    loaded.imageReferences.find((row) => row.id === imageContext?.referenceId) ??
    loaded.imageReferences[0];
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
