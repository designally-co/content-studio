import "server-only";
import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projects,
  categories,
  drafts,
  refinements,
  images,
  imageReferences,
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

  const [draftRows, refinementRows, imageRows, referenceRows] = await Promise.all([
    db.select().from(drafts).where(eq(drafts.projectId, id)).orderBy(asc(drafts.variationNo)),
    db
      .select()
      .from(refinements)
      .where(eq(refinements.projectId, id))
      .orderBy(asc(refinements.createdAt)),
    db.select().from(images).where(eq(images.projectId, id)).orderBy(desc(images.createdAt)),
    // References survive a reload now that they can be found automatically as
    // well as chosen. A set the editor did not assemble by hand is one they
    // have to be able to come back to, look at, and remove from.
    db
      .select()
      .from(imageReferences)
      .where(eq(imageReferences.projectId, id))
      .orderBy(asc(imageReferences.createdAt)),
  ]);

  return {
    project,
    brand,
    articleRules,
    category,
    drafts: draftRows,
    refinements: refinementRows,
    images: imageRows,
    imageReferences: referenceRows,
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
