"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories } from "@/db/schema";
import type { ProjectInputs, Language, SelectedTopic } from "@/db/schema";
import { requireUser } from "@/lib/session";
import type { EditorialFormat } from "@/lib/editorial";
import { getBrand } from "@/lib/brand";
import { getArticleRules } from "@/lib/article-template";
import { buildSystemPrompt, getModels, runJson } from "@/lib/anthropic";
import { topicsTask } from "@/prompts/tasks";
import { CONTENT_PILLARS, pillarForDirection } from "@/lib/content-pillars";

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

type TopicIdeasResponse = { topics: SelectedTopic[] };

export async function generateTopicIdeasAction(input: {
  categoryId?: string;
  categoryName?: string;
  language: Language;
}): Promise<SelectedTopic[]> {
  await requireUser();
  const db = await getDb();
  const [category] = input.categoryId
    ? await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1)
    : [];
  const categoryName = category?.name || input.categoryName?.trim() || CONTENT_PILLARS[0].directions[0];
  const pillar = pillarForDirection(categoryName);
  const [brand, articleRules, models] = await Promise.all([getBrand(), getArticleRules(), getModels()]);
  const { data } = await runJson<TopicIdeasResponse>({
    model: models.research,
    system: buildSystemPrompt({
      brand,
      articleRules,
      category: category || null,
      language: input.language,
      inputs: { articleMode: "editorial" },
    }),
    task: topicsTask({
      categoryName,
      language: input.language,
      pillarName: pillar?.name,
      pillarPurpose: pillar?.purpose,
      examples: pillar?.examples,
    }),
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
    projectId: null,
    stage: "topic_ideas",
  });

  return (data.topics || [])
    .filter((topic) => topic.title?.trim())
    .slice(0, 8)
    .map((topic) => ({ ...topic, title: topic.title.trim(), source: "suggested" as const }));
}

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();

  const categoryRaw = String(formData.get("categoryId") ?? "");
  const newCategory = String(formData.get("newCategory") ?? "").trim();
  // Content is English-only; ignore any submitted language.
  const language: Language = "en";

  // Resolve the category: a new name is created on the fly (and persisted so
  // it's reusable), an existing id is used as-is, "suggest"/empty means none.
  let categoryId: string | null = null;
  if (newCategory) {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`lower(${categories.name}) = ${newCategory.toLowerCase()}`)
      .limit(1);
    if (existing) {
      categoryId = existing.id;
    } else {
      const [created] = await db.insert(categories).values({ name: newCategory }).returning();
      categoryId = created.id;
    }
  } else if (categoryRaw && categoryRaw !== "suggest") {
    categoryId = categoryRaw;
  }

  const brief = String(formData.get("brief") ?? "").trim();
  const startMode = String(formData.get("startMode") ?? "brief");
  const exactTopic = String(formData.get("exactTopic") ?? "").trim();
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
  const seedText = exactTopic || chosenTopic || brief;

  const inputs: ProjectInputs = {
    articleMode: "editorial",
    brief: brief || undefined,
    editorialFormat: inferEditorialFormat(seedText),
    editorialPeriod: extractEditorialPeriod(seedText),
    editorialReader: "Designers and creative teams",
    editorialEntryCount: 10,
  };

  let selectedTopic: SelectedTopic | null = null;
  if (startMode === "topic" && exactTopic) {
    selectedTopic = { title: exactTopic, source: "custom" };
  } else if (startMode === "brief" && brief) {
    selectedTopic = { title: "Article from brief", angle: brief, source: "brief" };
  } else if (startMode === "discover" && chosenTopic) {
    selectedTopic = {
      title: chosenTopic,
      angle: chosenAngle || undefined,
      whyTimely: chosenWhyTimely || undefined,
      searchIntent: chosenSearchIntent || undefined,
      researchSources: chosenResearchSources.length ? chosenResearchSources : undefined,
      source: "suggested",
    };
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
