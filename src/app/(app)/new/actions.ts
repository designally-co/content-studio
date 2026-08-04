"use server";

import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories } from "@/db/schema";
import type { ProjectInputs, Language, SelectedTopic } from "@/db/schema";
import { requireUser } from "@/lib/session";
import type { EditorialFormat } from "@/lib/editorial";
import { getBrand } from "@/lib/brand";
import { getArticleRules } from "@/lib/article-template";
import { buildSystemPrompt, getModels, runJson } from "@/lib/anthropic";
import { topicsTask, articleSetupTask, recencyWindow } from "@/prompts/tasks";
import { pillarForDirection } from "@/lib/content-pillars";

/** A generated idea plus the content direction it was filed under. */
export type TopicIdea = SelectedTopic & { directionId: string; directionName: string };

/**
 * Decides whether free-text input is a brief (instructions to honor) or a topic
 * (a headline to research). Deliberately biased toward "brief": reading a brief
 * as a topic silently drops the editor's constraints, while reading a short
 * topic as a brief only means the brief is short.
 */
function readsAsBrief(text: string): boolean {
  const value = text.trim();
  if (value.length >= 180) return true;
  if (value.includes("\n")) return true;
  // Two or more sentence terminators mean prose, not a headline.
  if ((value.match(/[.!?](\s|$)/g) ?? []).length >= 2) return true;
  if (value.length >= 120) return true;
  // Instructional wording at moderate length: the editor is directing, not naming.
  return value.length > 60 && /\b(cover|covers|include|includes|explain|audience|readers?|should|make sure|focus on|avoid|tone|angle)\b/i.test(value);
}

/** Keeps only real http(s) sources, so a hallucinated URL never reaches the draft. */
function cleanSources(raw: { name?: string; url?: string }[] | undefined) {
  return (raw ?? []).flatMap((item) => {
    const name = item?.name?.trim();
    const url = item?.url?.trim();
    if (!name || !url) return [];
    try {
      const target = new URL(url);
      return target.protocol === "https:" || target.protocol === "http:"
        ? [{ name, url: target.toString() }]
        : [];
    } catch {
      return [];
    }
  }).slice(0, 3);
}

/** The active content directions, ordered, with their pillar for prompt context. */
async function loadDirections() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

function inferEditorialFormat(value: string): EditorialFormat {
  const text = value.toLowerCase();
  if (/\b(compare|comparison|versus|\bvs\.?\b)/.test(text)) return "comparison";
  if (/\b(profile|interview|studio|designer)\b/.test(text)) return "profile";
  if (/\b(trend|trending|popular)\b/.test(text)) return "trend";
  if (/\b(resource|free|website|tool|template)\b/.test(text)) return "resources";
  if (/\b(new|release|launch)\b/.test(text)) return "releases";
  if (/\b(best|top|roundup|collection)\b/.test(text)) return "roundup";
  return "explainer";
}

function extractEditorialPeriod(value: string): string | undefined {
  const match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i);
  return match?.[0];
}

type TopicIdeasResponse = {
  topics: Array<SelectedTopic & { direction?: string; sources?: { name?: string; url?: string }[] }>;
};

export async function generateTopicIdeasAction(input: {
  categoryId?: string;
  categoryName?: string;
  language: Language;
}): Promise<TopicIdea[]> {
  await requireUser();
  const db = await getDb();
  const [category] = input.categoryId
    ? await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1)
    : [];
  const directions = await loadDirections();
  const requestedName = category?.name || input.categoryName?.trim();
  const selectedDirection = requestedName
    ? directions.find((direction) => direction.name.toLowerCase() === requestedName.toLowerCase())
    : undefined;
  const categoryName = selectedDirection?.name;
  const pillar = categoryName ? pillarForDirection(categoryName) : undefined;
  const [brand, articleRules, models] = await Promise.all([getBrand(), getArticleRules(), getModels()]);
  const { today, since } = recencyWindow();

  const system = buildSystemPrompt({
    brand,
    articleRules,
    category: category || null,
    language: input.language,
    inputs: { articleMode: "editorial" },
  });
  const buildTask = (researchLive: boolean) =>
    topicsTask({
      categoryName,
      language: input.language,
      pillarName: pillar?.name,
      pillarPurpose: pillar?.purpose,
      examples: pillar?.examples,
      directionNames: categoryName ? undefined : directions.map((direction) => direction.name),
      today,
      since,
      researchLive,
    });
  const schema = {
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
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, url: { type: "string" } },
                required: ["name", "url"],
                additionalProperties: false,
              },
            },
            ...(categoryName ? {} : { direction: { type: "string", enum: directions.map((direction) => direction.name) } }),
          },
          required: ["title", "angle", "whyTimely", "searchIntent", "sources", ...(categoryName ? [] : ["direction"])],
          additionalProperties: false,
        },
      },
    },
    required: ["topics"],
    additionalProperties: false,
  };

  let data: TopicIdeasResponse;
  try {
    ({ data } = await runJson<TopicIdeasResponse>({
      model: models.research,
      system,
      task: buildTask(true),
      schema,
      maxTokens: 2400,
      // Open mode has to cover four or more directions, so it gets one more
      // lookup than a single-direction request.
      webSearch: { maxUses: categoryName ? 2 : 3 },
      timeoutMs: 30000,
      projectId: null,
      stage: "topic_ideas",
    }));
  } catch {
    // Ideas must never be blocked by the web tool. If search is slow or
    // unavailable, return a conservative set that claims no recency rather
    // than failing the editor's only starting point.
    ({ data } = await runJson<TopicIdeasResponse>({
      model: models.research,
      system,
      task: buildTask(false),
      schema,
      maxTokens: 1600,
      timeoutMs: 25000,
      projectId: null,
      stage: "topic_ideas_fallback",
    }));
  }

  return (data.topics || []).flatMap((topic) => {
    if (!topic.title?.trim()) return [];
    const direction = categoryName
      ? selectedDirection
      : directions.find((item) => item.name.toLowerCase() === topic.direction?.trim().toLowerCase());
    if (!direction) return [];
    const researchSources = cleanSources(topic.sources);
    return [{
      title: topic.title.trim(),
      angle: topic.angle,
      whyTimely: topic.whyTimely,
      searchIntent: topic.searchIntent,
      researchSources: researchSources.length ? researchSources : undefined,
      source: "suggested" as const,
      directionId: direction.id,
      directionName: direction.name,
    }];
  }).slice(0, 8);
}

export type ArticleSetup = {
  inputKind: "topic" | "brief";
  directionId: string;
  directionName: string;
  workingTitle: string;
};

/** Resolves the fields the merged composer deliberately leaves implicit. */
export async function inferArticleSetupAction(input: {
  text: string;
  categoryId?: string;
}): Promise<ArticleSetup> {
  await requireUser();
  const text = input.text.trim();
  if (!text) throw new Error("Describe the article you want to create.");

  const directions = await loadDirections();
  const chosenDirection = directions.find((direction) => direction.id === input.categoryId);
  const inputKind = readsAsBrief(text) ? "brief" : "topic";
  const needDirection = !chosenDirection;
  const needTitle = inputKind === "brief";

  if (!needDirection && !needTitle) {
    return {
      inputKind,
      directionId: chosenDirection.id,
      directionName: chosenDirection.name,
      workingTitle: text,
    };
  }

  const [brand, articleRules, models] = await Promise.all([getBrand(), getArticleRules(), getModels()]);
  const { data } = await runJson<{ direction?: string; workingTitle?: string }>({
    model: models.research,
    system: buildSystemPrompt({
      brand,
      articleRules,
      category: null,
      language: "en",
      inputs: { articleMode: "editorial" },
    }),
    task: articleSetupTask({
      text,
      needDirection,
      needTitle,
      directionNames: directions.map((direction) => direction.name),
    }),
    schema: {
      type: "object",
      properties: {
        ...(needDirection ? { direction: { type: "string", enum: directions.map((direction) => direction.name) } } : {}),
        ...(needTitle ? { workingTitle: { type: "string" } } : {}),
      },
      required: [...(needDirection ? ["direction"] : []), ...(needTitle ? ["workingTitle"] : [])],
      additionalProperties: false,
    },
    maxTokens: 220,
    projectId: null,
    stage: "article_setup",
  });

  const inferredDirection = chosenDirection ?? directions.find(
    (direction) => direction.name.toLowerCase() === data.direction?.trim().toLowerCase()
  );
  const workingTitle = (needTitle ? data.workingTitle : text)?.trim();
  if (!inferredDirection || !workingTitle) {
    throw new Error("We could not confidently determine the article setup. Choose a content direction and try again.");
  }

  return {
    inputKind,
    directionId: inferredDirection.id,
    directionName: inferredDirection.name,
    workingTitle,
  };
}

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();

  const categoryRaw = String(formData.get("categoryId") ?? "");
  // Content is English-only; ignore any submitted language.
  const language: Language = "en";

  const [validCategory] = categoryRaw
    ? await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryRaw)).limit(1)
    : [];
  const categoryId = validCategory?.id ?? null;

  // A content direction is required — it becomes the article's category and its
  // publishing tags, without which the Hub can't accept the article.
  if (!categoryId) {
    throw new Error("Choose a content direction before generating a draft.");
  }

  const articleInput = String(formData.get("articleInput") ?? "").trim();
  const inputKind = String(formData.get("inputKind") ?? "topic");
  const workingTitle = String(formData.get("workingTitle") ?? "").trim();
  const chosenTopic = String(formData.get("chosenTopic") ?? "").trim();
  const chosenAngle = String(formData.get("chosenAngle") ?? "").trim();
  const chosenWhyTimely = String(formData.get("chosenWhyTimely") ?? "").trim();
  const chosenSearchIntent = String(formData.get("chosenSearchIntent") ?? "").trim();
  let chosenResearchSources: { name: string; url: string }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("chosenResearchSources") ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      chosenResearchSources = parsed.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const name = typeof item.name === "string" ? item.name.trim() : "";
        const url = typeof item.url === "string" ? item.url.trim() : "";
        try {
          const target = new URL(url);
          return name && (target.protocol === "https:" || target.protocol === "http:") ? [{ name, url: target.toString() }] : [];
        } catch {
          return [];
        }
      }).slice(0, 3);
    }
  } catch {
    // Ignore malformed client data and perform normal article research.
  }
  const seedText = chosenTopic || workingTitle || articleInput;

  const inputs: ProjectInputs = {
    articleMode: "editorial",
    brief: inputKind === "brief" ? articleInput : undefined,
    editorialFormat: inferEditorialFormat(seedText),
    editorialPeriod: extractEditorialPeriod(seedText),
    editorialReader: "Designers and creative teams",
    editorialEntryCount: 10,
  };

  let selectedTopic: SelectedTopic | null = null;
  if (chosenTopic) {
    selectedTopic = {
      title: chosenTopic,
      angle: chosenAngle || undefined,
      whyTimely: chosenWhyTimely || undefined,
      searchIntent: chosenSearchIntent || undefined,
      researchSources: chosenResearchSources.length ? chosenResearchSources : undefined,
      source: "suggested",
    };
  } else if (workingTitle && articleInput) {
    selectedTopic = inputKind === "brief"
      ? { title: workingTitle, angle: articleInput, source: "brief" }
      : { title: workingTitle, source: "custom" };
  }

  const [project] = await db
    .insert(projects)
    .values({
      categoryId,
      language,
      status: "draft",
      stage: selectedTopic ? 3 : 2,
      inputs,
      selectedTopic,
      createdBy: user.id,
    })
    .returning();

  const nextStage = selectedTopic ? 3 : 2;
  redirect(`/pipeline/${project.id}?stage=${nextStage}`);
}
