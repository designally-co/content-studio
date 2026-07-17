import "server-only";
import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projects,
  categories,
  drafts,
  refinements,
  images,
  apiUsageLog,
} from "@/db/schema";
import { getBrand } from "./brand";
import { getArticleRules } from "./article-template";
import type { PipelineContext } from "./anthropic";

export async function loadProject(id: string) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) return null;

  const [brand, articleRules] = await Promise.all([getBrand(), getArticleRules()]);
  const category = project.categoryId
    ? (
        await db
          .select()
          .from(categories)
          .where(eq(categories.id, project.categoryId))
          .limit(1)
      )[0] ?? null
    : null;

  const [draftRows, refinementRows, imageRows, usageRows] = await Promise.all([
    db.select().from(drafts).where(eq(drafts.projectId, id)).orderBy(asc(drafts.variationNo)),
    db
      .select()
      .from(refinements)
      .where(eq(refinements.projectId, id))
      .orderBy(asc(refinements.createdAt)),
    db.select().from(images).where(eq(images.projectId, id)).orderBy(desc(images.createdAt)),
    db.select().from(apiUsageLog).where(eq(apiUsageLog.projectId, id)),
  ]);

  return {
    project,
    brand,
    articleRules,
    category,
    drafts: draftRows,
    refinements: refinementRows,
    images: imageRows,
    usage: usageRows,
  };
}

export type LoadedProject = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

export function pipelineContext(p: LoadedProject): PipelineContext {
  return {
    brand: p.brand,
    articleRules: p.articleRules,
    category: p.category,
    language: p.project.language,
    inputs: p.project.inputs,
  };
}

/** Cost + token totals for a project, grouped by pipeline stage. */
export function costSummary(p: LoadedProject) {
  const byStage = new Map<string, { tokensIn: number; tokensOut: number; costUsd: number }>();
  let textCostUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const row of p.usage) {
    const key = normalizeStage(row.stage);
    const entry = byStage.get(key) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 };
    entry.tokensIn += row.tokensIn;
    entry.tokensOut += row.tokensOut;
    entry.costUsd += Number(row.costUsd);
    byStage.set(key, entry);
    textCostUsd += Number(row.costUsd);
    tokensIn += row.tokensIn;
    tokensOut += row.tokensOut;
  }

  const imageCostUsd = p.images.reduce((s, img) => s + Number(img.costUsd), 0);

  return {
    byStage: Array.from(byStage.entries()).map(([stage, v]) => ({ stage, ...v })),
    tokensIn,
    tokensOut,
    textCostUsd,
    imageCostUsd,
    totalCostUsd: textCostUsd + imageCostUsd,
    imageCount: p.images.length,
  };
}

function normalizeStage(stage: string): string {
  const base = stage.replace(/:retry$/, "");
  const labels: Record<string, string> = {
    topics: "Topics",
    outline: "Outline",
    draft: "Drafts",
    refine: "Refine",
    competitor: "Competitor analysis",
    image_prompt: "Image prompt",
  };
  for (const [k, v] of Object.entries(labels)) {
    if (base.startsWith(k)) return v;
  }
  return base;
}
