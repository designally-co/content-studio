"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories } from "@/db/schema";
import type { ProjectInputs, Language, SelectedTopic } from "@/db/schema";
import { requireUser } from "@/lib/session";
import type { EditorialFormat } from "@/lib/editorial";
import { getBrand } from "@/lib/brand";
import { getArticleRules } from "@/lib/article-template";
import { buildSystemPrompt, getModels, runJson } from "@/lib/anthropic";
import { articleSetupTask } from "@/prompts/tasks";
import { generateTopicIdeas, loadDirections, type TopicIdea } from "@/lib/pipeline/topics";

/* Re-exported for the composer, which has always imported it from here. A type
   is erased at compile time, so this creates no server-action endpoint — only
   exported async FUNCTIONS in a "use server" module become callable. */
export type { TopicIdea };


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

/** Session-checked wrapper. The work lives in @/lib/pipeline/topics. */
export async function generateTopicIdeasAction(input: {
  categoryId?: string;
  categoryName?: string;
  language: Language;
}): Promise<TopicIdea[]> {
  await requireUser();
  return generateTopicIdeas(input);
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
