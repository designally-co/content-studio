import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import type { Language, SelectedTopic } from "@/db/schema";
import { getBrand } from "@/lib/brand";
import { getArticleRules } from "@/lib/article-template";
import { buildSystemPrompt, getModels, runJson } from "@/lib/anthropic";
import { topicsTask, recencyWindow } from "@/prompts/tasks";
import { pillarForDirection } from "@/lib/content-pillars";

/**
 * Topic ideas, with no session check.
 *
 * Moved out of the composer's `"use server"` module because every exported
 * async function in one of those is a callable endpoint — an auth-free core
 * exported from there would be reachable by anyone who can find the action id.
 * The composer's action imports this behind `requireUser()`; the autopilot
 * runner imports it behind its own shared-secret check. One implementation,
 * two callers.
 */

/** A generated idea plus the content direction it was filed under. */
export type TopicIdea = SelectedTopic & { directionId: string; directionName: string };

/** Keeps only real http(s) sources, so a hallucinated URL never reaches the draft. */
export function cleanSources(raw: { name?: string; url?: string }[] | undefined) {
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
export async function loadDirections() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((row) => ({ id: row.id, name: row.name }));
}


type TopicIdeasResponse = {
  topics: Array<SelectedTopic & { direction?: string; sources?: { name?: string; url?: string }[] }>;
};

/*
 * WEB SEARCH IS WHAT MADE THIS SLOW, AND IT DID NOT FIT.
 *
 * Measured against the real API with this exact request shape, Haiku 4.5:
 *
 *     with one web search   29.1s   (1142 output tokens)
 *     without web search    13.2s   ( 722 output tokens)
 *
 * A search is a round trip taken inside the model's turn, and it costs ~16s.
 * The original ceiling was 30s, barely above the 29.1s the call actually needs,
 * so ideas were always one slow day from timing out — and when they did, the
 * fallback ran and the pair overran the 60s function. That is the 504 in the
 * logs, and every later "Request timed out" was a ceiling set below 29s.
 *
 * No amount of arithmetic makes a 29s call plus a fallback fit in a 60s
 * function with room to spare. So the search is gone from this step: 13s, one
 * call, no fallback, no truncation heal to budget around.
 *
 * WHAT THIS COSTS: ideas are no longer grounded in live sources, so they claim
 * no recency. The prompt already had a task variant for exactly this — the old
 * fallback used it whenever search was unavailable — so the wording is honest
 * about it rather than inventing dates.
 */
const IDEAS_TIMEOUT_MS = 35_000;

export async function generateTopicIdeas(input: {
  categoryId?: string;
  categoryName?: string;
  language: Language;
}): Promise<TopicIdea[]> {
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

  /* One call, no web search — see the note on IDEAS_TIMEOUT_MS. `buildTask`
     takes `researchLive: false`, which is the variant that does not claim
     recency it cannot verify. */
  const { data } = await runJson<TopicIdeasResponse>({
    model: models.research,
    system,
    task: buildTask(false),
    schema,
    // A ceiling, deliberately roomy: truncation costs an entire extra call via
    // the heal retry in lib/anthropic.ts, while unused headroom costs nothing.
    maxTokens: 2400,
    timeoutMs: IDEAS_TIMEOUT_MS,
    projectId: null,
    stage: "topic_ideas",
  });

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
