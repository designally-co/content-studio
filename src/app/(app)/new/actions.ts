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

/*
 * The function's own ceiling, mirroring `export const maxDuration = 60` on the
 * Create page. Vercel's Hobby plan does not allow more, so the work has to fit
 * rather than the limit being raised.
 */
const FUNCTION_BUDGET_MS = 60_000;
/** Auth, the database, settings lookups, JSON parsing and the response itself. */
const RESPONSE_HEADROOM_MS = 10_000;
/*
 * TIMEOUTS ARE CEILINGS, AND max_tokens IS NOT A SPEED CONTROL.
 *
 * Two mistakes are recorded here because each produced a different production
 * failure and the second was caused by fixing the first.
 *
 * 1. `attemptWithHeal` in lib/anthropic.ts retries once at 1.6x the budget when
 *    a response is cut off by `max_tokens`, and `timeoutMs` is handed to each
 *    `messages.create` — a ceiling per CALL, not per runJson. Budgeting as
 *    though one runJson were one call let the pair overrun the 60s function.
 *
 * 2. Cutting `max_tokens` to make it "faster" did the opposite. It is a
 *    ceiling, not a target: latency comes from the tokens the model actually
 *    writes, so a lower ceiling saves nothing and only risks truncation — which
 *    then triggers the heal above and doubles the time. Then halving every
 *    timeout to compensate left 14s for a call that has to run a web search
 *    inside its turn, and it aborted itself:
 *
 *        Error: Request timed out.   POST /  ->  500
 *
 * So: generous ceilings on `max_tokens` (truncation is the expensive failure,
 * not the wasted headroom), realistic per-call timeouts, and speed comes from
 * asking for three ideas and one web lookup instead of eight and three.
 *
 * Sized so that even a heal on the primary leaves the total inside 60s:
 * 5s setup + 2x24s = 53s, with the fallback skipped for lack of room.
 */
const PRIMARY_MAX_MS = 24_000;
const FALLBACK_MAX_MS = 12_000;
/** Below this the fallback cannot realistically return, so it is not started. */
const FALLBACK_MIN_MS = 12_000;
/** Likewise for the primary: under this there is no point starting at all. */
const PRIMARY_MIN_MS = 8_000;

export async function generateTopicIdeasAction(input: {
  categoryId?: string;
  categoryName?: string;
  language: Language;
}): Promise<TopicIdea[]> {
  /*
   * ONE WALL-CLOCK BUDGET FOR BOTH MODEL CALLS.
   *
   * This action used to give the primary call 30s and its fallback another
   * 25s. Those are ceilings the Anthropic SDK actually enforces, so a slow
   * primary spent its full 30s, failed, and handed the fallback a further 25s
   * — 55s of model time before auth, the database, three settings lookups,
   * web-search latency and cold start. The function is capped at 60s, so the
   * pair overran it and Vercel killed the request:
   *
   *     Vercel Runtime Timeout Error: Task timed out after 60 seconds
   *     POST /  ->  504
   *
   * which reaches the editor as "An unexpected response was received from the
   * server" — a Next Server Action error that says nothing about the cause.
   *
   * The two calls now share a deadline instead of each holding their own, so
   * their sum cannot exceed what the function has. If the fallback would not
   * have time to finish, it is not started and the original failure is raised
   * instead: a real message beats a 504.
   */
  const startedAt = Date.now();
  const budgetMsLeft = () => FUNCTION_BUDGET_MS - RESPONSE_HEADROOM_MS - (Date.now() - startedAt);

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

  /* Clamped, not just capped. A cold start with a slow database can eat enough
     of the budget that `left - FALLBACK_MIN_MS` goes negative, and handing the
     SDK a negative timeout is not a defined thing to do. If there is not even
     room for the primary, say so plainly rather than starting a call that
     cannot land. */
  const primaryTimeoutMs = Math.min(PRIMARY_MAX_MS, budgetMsLeft() - FALLBACK_MIN_MS);
  if (primaryTimeoutMs < PRIMARY_MIN_MS) {
    throw new Error("The server ran out of time before it could start. Try again.");
  }

  let data: TopicIdeasResponse;
  try {
    ({ data } = await runJson<TopicIdeasResponse>({
      model: models.research,
      system,
      task: buildTask(true),
      schema,
      // A ceiling, deliberately roomy. Three ideas will not come close to it,
      // and headroom costs nothing — truncation costs a whole extra call.
      maxTokens: 2400,
      // One lookup. Each search is a round trip inside the model's turn and is
      // the single largest thing between clicking Generate and seeing ideas;
      // open mode no longer has to cover four directions, so it no longer
      // needs an extra one.
      webSearch: { maxUses: 1 },
      // Capped so that a full-length failure still leaves the fallback room.
      timeoutMs: primaryTimeoutMs,
      projectId: null,
      stage: "topic_ideas",
    }));
  } catch (primaryError) {
    // Ideas must never be blocked by the web tool. If search is slow or
    // unavailable, return a conservative set that claims no recency rather
    // than failing the editor's only starting point — but only if there is
    // still time to return it. Starting a call that cannot finish turns a
    // readable error into a 504.
    const left = budgetMsLeft();
    if (left < FALLBACK_MIN_MS) throw primaryError;
    ({ data } = await runJson<TopicIdeasResponse>({
      model: models.research,
      system,
      task: buildTask(false),
      schema,
      maxTokens: 1600,
      timeoutMs: Math.min(FALLBACK_MAX_MS, left),
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
