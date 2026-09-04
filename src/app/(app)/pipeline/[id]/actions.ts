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
  isAnthropicConfigured,
  runJson,
} from "@/lib/anthropic";
import { brandReviewTask, editorialReviewTask } from "@/prompts/tasks";
import { preparePlanCore } from "@/lib/pipeline/plan";
import { generateImagePromptCore } from "@/lib/pipeline/image-prompt";
import type { BrandReviewResult } from "@/lib/brand-review";
import {
  type DraftedImagePrompt,
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
    await requireUser();
    return await preparePlanCore(projectId);
  } catch (reason) {
    return {
      ok: false,
      message: reason instanceof Error ? reason.message : "Could not prepare the draft.",
    };
  }
}

export async function goToFinalizeAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  await bumpStage(projectId, 6);
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=6`);
}

/** Session-checked wrapper. The work lives in @/lib/pipeline/image-prompt. */
export async function generateImagePromptAction(
  projectId: string,
  imageContext?: { variationCount?: number; referenceId?: string }
): Promise<DraftedImagePrompt> {
  await requireUser();
  return generateImagePromptCore(projectId, imageContext);
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
