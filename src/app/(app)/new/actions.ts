"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories } from "@/db/schema";
import type { ProjectInputs, Language } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { parseGscInsights } from "@/lib/gsc";
import { fetchReadableText } from "@/lib/fetch-url";
import {
  getModels,
  isAnthropicConfigured,
  runText,
} from "@/lib/anthropic";
import { competitorTask } from "@/prompts/tasks";

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();

  const categoryRaw = String(formData.get("categoryId") ?? "");
  const newCategory = String(formData.get("newCategory") ?? "").trim();
  const language = String(formData.get("language") ?? "en") as Language;

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

  const keyword = String(formData.get("keyword") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const competitorUrl = String(formData.get("competitorUrl") ?? "").trim();
  const gscRaw = String(formData.get("gsc") ?? "").trim();
  const extraGuidelines = String(formData.get("extraGuidelines") ?? "").trim();

  const inputs: ProjectInputs = {
    keyword: keyword || undefined,
    brief: brief || undefined,
    competitorUrl: competitorUrl || undefined,
    extraGuidelines: extraGuidelines || undefined,
  };

  if (gscRaw) {
    const insights = parseGscInsights(gscRaw);
    if (insights) inputs.gscInsights = insights;
  }

  // Fetch + summarize competitor article (never copies — reference only).
  if (competitorUrl) {
    try {
      const text = await fetchReadableText(competitorUrl);
      if ((await isAnthropicConfigured()) && text) {
        const { research } = await getModels();
        const { text: summary } = await runText({
          model: research,
          task: `${competitorTask(competitorUrl)}\n\nHere is the extracted page text:\n${text}`,
          maxTokens: 800,
          projectId: null,
          stage: "competitor",
        });
        inputs.competitorSummary = summary.trim();
      } else if (text) {
        inputs.competitorSummary =
          "(Automatic summary unavailable — ANTHROPIC_API_KEY not configured. Raw excerpt:)\n" +
          text.slice(0, 1500);
      }
    } catch (err) {
      inputs.competitorSummary = `(Could not fetch competitor URL: ${
        err instanceof Error ? err.message : "unknown error"
      })`;
    }
  }

  const [project] = await db
    .insert(projects)
    .values({
      categoryId,
      language,
      status: "in_pipeline",
      stage: 2,
      inputs,
      createdBy: user.id,
    })
    .returning();

  redirect(`/pipeline/${project.id}`);
}
