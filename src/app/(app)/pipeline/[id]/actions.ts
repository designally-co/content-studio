"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, drafts } from "@/db/schema";
import type { SelectedTopic, ApprovalOutcome } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject, pipelineContext } from "@/lib/projects";
import {
  getModels,
  buildSystemPrompt,
  runJson,
  runText,
} from "@/lib/anthropic";
import { topicsTask, outlineTask, imagePromptTask } from "@/prompts/tasks";
import { outlineToMarkdown, type OutlineJson } from "@/lib/outline";

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

// ---- Stage 2: topics ----
type TopicsResponse = { topics: SelectedTopic[] };

export async function generateTopicsAction(projectId: string): Promise<SelectedTopic[]> {
  const loaded = await ctxFor(projectId);
  const ctx = pipelineContext(loaded);
  const { research } = await getModels();
  const categoryName = loaded.category?.name ?? ctx.inputs.keyword ?? "the brand's field";

  const { data } = await runJson<TopicsResponse>({
    model: research,
    system: buildSystemPrompt(ctx),
    task: topicsTask({ categoryName, language: ctx.language }),
    maxTokens: 3500,
    webSearch: true,
    projectId,
    stage: "topics",
  });

  const topics = (data.topics ?? []).map((t) => ({
    title: t.title,
    angle: t.angle,
    whyTimely: t.whyTimely,
    searchIntent: t.searchIntent,
    source: "suggested" as const,
  }));

  const db = await getDb();
  await db
    .update(projects)
    .set({ topicSuggestions: topics, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  return topics;
}

export async function selectTopicAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  const angle = String(formData.get("angle") ?? "").trim();
  const source = String(formData.get("source") ?? "custom") as SelectedTopic["source"];
  if (!title) return;

  const db = await getDb();
  const topic: SelectedTopic = {
    title,
    angle: angle || undefined,
    source,
  };
  await db
    .update(projects)
    .set({ selectedTopic: topic, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await bumpStage(projectId, 3);
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=3`);
}

// ---- Stage 3: outline ----
export async function generateOutlineAction(projectId: string): Promise<string> {
  const loaded = await ctxFor(projectId);
  const ctx = pipelineContext(loaded);
  const { drafting } = await getModels();
  const topic = loaded.project.selectedTopic;
  const topicTitle = topic?.title ?? ctx.inputs.brief ?? ctx.inputs.keyword ?? "the topic";
  const longForm = loaded.articleRules.longForm;

  const { data } = await runJson<OutlineJson>({
    model: drafting,
    system: buildSystemPrompt(ctx),
    task: outlineTask({ topicTitle, longForm }),
    maxTokens: 2000,
    projectId,
    stage: "outline",
  });

  const markdown = outlineToMarkdown(data, longForm);
  const db = await getDb();
  await db
    .update(projects)
    .set({ outline: { markdown, approved: false }, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  return markdown;
}

export async function saveOutlineAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const markdown = String(formData.get("markdown") ?? "");
  const db = await getDb();
  await db
    .update(projects)
    .set({ outline: { markdown, approved: false }, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
}

export async function approveOutlineAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const markdown = String(formData.get("markdown") ?? "");
  if (!markdown.trim()) return;
  const db = await getDb();
  await db
    .update(projects)
    .set({ outline: { markdown, approved: true }, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await bumpStage(projectId, 4);
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=4`);
}

// ---- Stage 4: select a draft ----
export async function selectDraftAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const draftId = String(formData.get("draftId"));
  const db = await getDb();
  const rows = await db.select().from(drafts).where(eq(drafts.projectId, projectId));
  for (const d of rows) {
    await db
      .update(drafts)
      .set({ isSelected: d.id === draftId })
      .where(eq(drafts.id, d.id));
  }
  await bumpStage(projectId, 5);
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=5`);
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
  imageContext?: { model?: string; aspectRatio?: string; hasReferenceImage?: boolean }
): Promise<string> {
  const loaded = await ctxFor(projectId);
  const ctx = pipelineContext(loaded);
  const { drafting } = await getModels();
  const selected = loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0];
  const title = loaded.project.selectedTopic?.title ?? "Untitled";
  const summary = (selected?.contentMd ?? "").slice(0, 800);

  const { text } = await runText({
    model: drafting,
    system: buildSystemPrompt(ctx),
    task: imagePromptTask({
      title,
      summary,
      model: imageContext?.model?.slice(0, 100),
      aspectRatio: imageContext?.aspectRatio?.slice(0, 10),
      hasReferenceImage: Boolean(imageContext?.hasReferenceImage),
    }),
    maxTokens: 400,
    projectId,
    stage: "image_prompt",
  });
  return text.trim();
}

export async function finalizeProjectAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const outcome = String(formData.get("outcome")) as ApprovalOutcome;
  if (!["approved_first", "approved_edited", "rejected"].includes(outcome)) return;

  const db = await getDb();
  await db
    .update(projects)
    .set({
      approvalOutcome: outcome,
      status: outcome === "rejected" ? "rejected" : "finalized",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  revalidatePath("/library");
  revalidatePath("/");
}

/**
 * Persist edited article text back to the selected draft (block-editor autosave
 * on the Finalize step). No revalidate — the client holds the editing state.
 */
export async function saveDraftContentAction(draftId: string, contentMd: string) {
  await requireUser();
  const db = await getDb();
  await db.update(drafts).set({ contentMd }).where(eq(drafts.id, draftId));
}
