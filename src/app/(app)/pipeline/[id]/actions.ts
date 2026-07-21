"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, drafts } from "@/db/schema";
import type { SelectedTopic } from "@/db/schema";
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
  topicsTask,
  outlineTask,
  imagePromptTask,
  articleVisualBriefTask,
  brandReviewTask,
  editorialResearchTask,
  editorialOutlineTask,
  editorialReviewTask,
  editorialArticlePlanTask,
} from "@/prompts/tasks";
import { outlineToMarkdown, type OutlineJson } from "@/lib/outline";
import type { BrandReviewResult } from "@/lib/brand-review";
import type { EditorialCandidate } from "@/lib/editorial";
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

export async function prepareSimpleArticleAction(projectId: string) {
  const loaded = await ctxFor(projectId);
  if (loaded.project.outline?.markdown.trim()) {
    await bumpStage(projectId, 4);
    revalidatePath(`/pipeline/${projectId}`);
    return;
  }
  const ctx = pipelineContext(loaded);
  const topic = loaded.project.selectedTopic?.source === "brief"
    ? loaded.project.selectedTopic.angle || ctx.inputs.brief || "Creative industry article"
    : loaded.project.selectedTopic?.title || ctx.inputs.brief || loaded.category?.name || "Creative industry article";
  const { research } = await getModels();
  const task = editorialArticlePlanTask({
    topic,
    brief: ctx.inputs.brief,
    format: ctx.inputs.editorialFormat,
    period: ctx.inputs.editorialPeriod,
    language: ctx.language,
    seedSources: loaded.project.selectedTopic?.researchSources,
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
  let data: OutlineJson;
  try {
    ({ data } = await runJson<OutlineJson>({
      model: research,
      system: buildResearchSystem(),
      cache: false,
      task,
      schema,
      maxTokens: 2000,
      webSearch: { maxUses: 1 },
      timeoutMs: 25000,
      projectId,
      stage: "article_research_plan",
    }));
  } catch {
    // Research must improve a draft, never prevent one. If the provider's web
    // tool is slow or unavailable, build a conservative source-free plan and
    // let the writer avoid unsupported current claims.
    ({ data } = await runJson<OutlineJson>({
      model: research,
      system: buildResearchSystem(),
      cache: false,
      task: `${task}\n\nLive source lookup is unavailable. Return a conservative plan now. Leave sources empty and avoid unsupported claims about popularity, release dates, rankings, or current trends.`,
      schema,
      maxTokens: 1600,
      timeoutMs: 25000,
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
  revalidatePath(`/pipeline/${projectId}`);
}

type EditorialCandidatesResponse = { candidates: Omit<EditorialCandidate, "id">[] };

function editorialEntryTarget(length: string): number {
  const values = [...length.matchAll(/\d{2,4}/g)].map((match) => Number(match[0]));
  const maximum = values.length ? Math.max(...values) : 1500;
  if (maximum <= 1200) return 6;
  if (maximum <= 1600) return 8;
  return 10;
}

function safeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function researchEditorialCandidatesAction(projectId: string): Promise<EditorialCandidate[]> {
  const loaded = await ctxFor(projectId);
  if (loaded.project.inputs.articleMode !== "editorial") throw new Error("This project is not using Editorial Discovery.");
  const ctx = pipelineContext(loaded);
  const { research } = await getModels();
  const entryCount = editorialEntryTarget(loaded.articleRules.length);
  const topic = loaded.project.selectedTopic?.source === "brief"
    ? loaded.project.selectedTopic.angle || ctx.inputs.brief || "creative resources"
    : loaded.project.selectedTopic?.title || ctx.inputs.brief || ctx.inputs.keyword || loaded.category?.name || "creative resources";
  const { data } = await runJson<EditorialCandidatesResponse>({
    model: research,
    system: buildResearchSystem(),
    cache: false,
    task: editorialResearchTask({
      topic,
      category: loaded.category?.name || "Creative Resources",
      format: ctx.inputs.editorialFormat || "roundup",
      period: ctx.inputs.editorialPeriod,
      reader: ctx.inputs.editorialReader || "Designers and creative teams",
      entryCount,
      language: ctx.language,
      seedSources: loaded.project.selectedTopic?.researchSources,
    }),
    schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, creator: { type: "string" }, organization: { type: "string" },
              officialUrl: { type: "string" }, sourceUrl: { type: "string" }, releaseEvidence: { type: "string" },
              concreteDetails: { type: "array", items: { type: "string" } }, distinctive: { type: "string" },
              whyItMatters: { type: "string" }, confidence: { type: "string", enum: ["confirmed", "needs_review"] },
            },
            required: ["name", "creator", "organization", "officialUrl", "sourceUrl", "releaseEvidence", "concreteDetails", "distinctive", "whyItMatters", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"], additionalProperties: false,
    },
    maxTokens: 4200,
    webSearch: { maxUses: loaded.project.selectedTopic?.researchSources?.length ? 2 : 3 },
    timeoutMs: 75000,
    projectId,
    stage: "editorial_research",
  });
  const candidates = (data.candidates || []).slice(0, 30).map((candidate, index) => ({
    ...candidate,
    officialUrl: safeSourceUrl(candidate.officialUrl),
    sourceUrl: safeSourceUrl(candidate.sourceUrl),
    id: `${index + 1}-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "candidate"}`,
  }));
  const selectedEditorialCandidateIds = candidates
    .filter((candidate) => candidate.confidence === "confirmed")
    .slice(0, entryCount)
    .map((candidate) => candidate.id);
  const db = await getDb();
  await db.update(projects).set({ inputs: { ...ctx.inputs, editorialEntryCount: entryCount, editorialCandidates: candidates, selectedEditorialCandidateIds }, updatedAt: new Date() }).where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  return candidates;
}

export async function generateEditorialOutlineAction(projectId: string, selectedIds: string[]): Promise<string> {
  const loaded = await ctxFor(projectId);
  const candidates = loaded.project.inputs.editorialCandidates || [];
  const targetCount = editorialEntryTarget(loaded.articleRules.length);
  const requestedIds = selectedIds.length
    ? selectedIds
    : loaded.project.inputs.selectedEditorialCandidateIds?.length
      ? loaded.project.inputs.selectedEditorialCandidateIds
      : (() => {
          const confirmed = candidates.filter((candidate) => candidate.confidence === "confirmed").slice(0, targetCount);
          return (confirmed.length ? confirmed : candidates.slice(0, targetCount)).map((candidate) => candidate.id);
        })();
  const selected = requestedIds.map((id) => candidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is EditorialCandidate => Boolean(candidate));
  if (selected.length === 0) throw new Error("Select at least one verified candidate.");
  const ctx = pipelineContext(loaded);
  const { research } = await getModels();
  const topic = loaded.project.selectedTopic?.source === "brief"
    ? loaded.project.selectedTopic.angle || ctx.inputs.brief || "Creative resources"
    : loaded.project.selectedTopic?.title || ctx.inputs.brief || loaded.category?.name || "Creative resources";
  const { data } = await runJson<OutlineJson>({
    model: research,
    system: buildResearchSystem(),
    cache: false,
    task: editorialOutlineTask({ topic, period: ctx.inputs.editorialPeriod, reader: ctx.inputs.editorialReader || "Designers and creative teams", candidates: selected }),
    schema: {
      type: "object",
      properties: {
        title: { type: "string" }, introAngle: { type: "string" },
        sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, points: { type: "array", items: { type: "string" } } }, required: ["heading", "points"], additionalProperties: false } },
        sources: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, whyRelevant: { type: "string" } }, required: ["name", "url", "whyRelevant"], additionalProperties: false } },
        cta: { type: "string" },
      },
      required: ["title", "introAngle", "sections", "sources", "cta"], additionalProperties: false,
    },
    maxTokens: 2600,
    projectId,
    stage: "editorial_outline",
  });
  const markdown = outlineToMarkdown(data, true);
  const db = await getDb();
  await db.update(projects).set({ inputs: { ...ctx.inputs, selectedEditorialCandidateIds: selected.map((candidate) => candidate.id) }, outline: { markdown, approved: false }, updatedAt: new Date() }).where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  return markdown;
}

/** Researches sources and builds the internal outline behind one simple UI action. */
export async function prepareEditorialDraftAction(projectId: string) {
  let loaded = await ctxFor(projectId);
  if (loaded.project.inputs.articleMode !== "editorial") {
    const db = await getDb();
    await db.update(projects).set({
      inputs: {
        ...loaded.project.inputs,
        articleMode: "editorial",
        editorialFormat: loaded.project.inputs.editorialFormat || "explainer",
        editorialReader: loaded.project.inputs.editorialReader || "Designers and creative teams",
        editorialEntryCount: loaded.project.inputs.editorialEntryCount || 10,
      },
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
    loaded = await ctxFor(projectId);
  }
  let candidates = loaded.project.inputs.editorialCandidates || [];
  if (candidates.length === 0) {
    candidates = await researchEditorialCandidatesAction(projectId);
    loaded = await ctxFor(projectId);
  }

  const targetCount = editorialEntryTarget(loaded.articleRules.length);
  const savedIds = loaded.project.inputs.selectedEditorialCandidateIds || [];
  const selectedIds = savedIds.length > 0
    ? savedIds
    : candidates
        .filter((candidate) => candidate.confidence === "confirmed")
        .slice(0, targetCount)
        .map((candidate) => candidate.id);
  const fallbackIds = selectedIds.length > 0
    ? selectedIds
    : candidates.slice(0, targetCount).map((candidate) => candidate.id);

  const markdown = await generateEditorialOutlineAction(projectId, fallbackIds);
  const db = await getDb();
  await db
    .update(projects)
    .set({ outline: { markdown, approved: true }, stage: Math.max(loaded.project.stage, 4), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=4`);
}

export async function completeEditorialPreparationAction(projectId: string) {
  const loaded = await ctxFor(projectId);
  const markdown = loaded.project.outline?.markdown.trim();
  if (!markdown) throw new Error("The article plan is not ready.");
  const db = await getDb();
  await db.update(projects).set({
    outline: { markdown, approved: true },
    stage: Math.max(loaded.project.stage, 4),
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=4`);
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
    system: buildResearchSystem(),
    cache: false,
    task: topicsTask({ categoryName, language: ctx.language }),
    schema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              angle: { type: "string" },
              whyTimely: { type: "string" },
              searchIntent: { type: "string" },
            },
            required: ["title", "angle", "whyTimely", "searchIntent"],
            additionalProperties: false,
          },
        },
      },
      required: ["topics"],
      additionalProperties: false,
    },
    maxTokens: 1400,
    projectId,
    stage: "topics",
  });

  // Anthropic structured outputs only support a restricted subset of JSON
  // Schema array cardinality. The task asks for 5–8; enforce the usable upper
  // bound here instead of sending unsupported minItems/maxItems constraints.
  const topics = (data.topics ?? [])
    .filter((t) => t.title?.trim())
    .slice(0, 8)
    .map((t) => ({
      title: t.title.trim(),
      angle: t.angle,
      whyTimely: t.whyTimely,
      searchIntent: t.searchIntent,
      source: "suggested" as const,
    }));

  if (topics.length === 0) {
    throw new Error("No usable directions were returned. Please try again.");
  }

  const db = await getDb();
  await db
    .update(projects)
    .set({ topicSuggestions: topics, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  return topics;
}

async function persistSelectedTopic(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  const angle = String(formData.get("angle") ?? "").trim();
  const whyTimely = String(formData.get("whyTimely") ?? "").trim();
  const searchIntent = String(formData.get("searchIntent") ?? "").trim();
  const source = String(formData.get("source") ?? "custom") as SelectedTopic["source"];
  if (!title) throw new Error("Choose a topic before preparing the draft.");

  const db = await getDb();
  const topic: SelectedTopic = {
    title,
    angle: angle || undefined,
    whyTimely: whyTimely || undefined,
    searchIntent: searchIntent || undefined,
    source,
  };
  await db
    .update(projects)
    .set({ selectedTopic: topic, outline: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await bumpStage(projectId, 3);
  revalidatePath(`/pipeline/${projectId}`);
  return projectId;
}

export async function selectTopicAction(formData: FormData) {
  await requireUser();
  const projectId = await persistSelectedTopic(formData);
  redirect(`/pipeline/${projectId}?stage=3`);
}

/** Selects a topic and completes the hidden research plan in one client action. */
export async function selectTopicAndPrepareSimpleArticleAction(formData: FormData) {
  await requireUser();
  const projectId = await persistSelectedTopic(formData);
  await prepareSimpleArticleAction(projectId);
}

export async function clearDirectionAction(projectId: string) {
  await ctxFor(projectId);
  const db = await getDb();
  await db
    .update(projects)
    .set({ selectedTopic: null, outline: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  redirect(`/pipeline/${projectId}?stage=2`);
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
    task: outlineTask({
      topicTitle,
      angle: topic?.angle,
      whyTimely: topic?.whyTimely,
      searchIntent: topic?.searchIntent,
      longForm,
    }),
    schema: longForm
      ? {
          type: "object",
          properties: {
            title: { type: "string" },
            introAngle: { type: "string" },
              sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  heading: { type: "string" },
                  points: { type: "array", items: { type: "string" } },
                },
                required: ["heading", "points"],
                additionalProperties: false,
              },
              },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    url: { type: "string" },
                    whyRelevant: { type: "string" },
                  },
                  required: ["name", "url", "whyRelevant"],
                  additionalProperties: false,
                },
              },
              cta: { type: "string" },
            },
          required: ["title", "introAngle", "sections", "sources", "cta"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: {
            title: { type: "string" },
            hook: { type: "string" },
            bodyAngle: { type: "string" },
            cta: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["title", "hook", "bodyAngle", "cta", "hashtags"],
          additionalProperties: false,
        },
    // Long-form outlines (many sections + sources) can exceed a tight budget;
    // runJson also self-heals on truncation, but start with headroom.
    maxTokens: longForm ? 6000 : 2000,
    webSearch: longForm,
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
  const artDirection = ART_DIRECTION_PRESETS.some((option) => option.value === requestedArtDirection)
    ? requestedArtDirection as ArtDirectionSelection
    : "auto";
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
        artDirection: { type: "string", enum: ["abstract_insight", "metaphorical_editorial", "editorial_studio", "retro_futurist", "tactile_flat_lay", "interface_showcase"] },
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

export async function finalizeProjectAction(formData: FormData) {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  if (!projectId) return;

  const db = await getDb();
  await db
    .update(projects)
    .set({
      approvalOutcome: null,
      status: "finalized",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
  revalidatePath("/");
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
