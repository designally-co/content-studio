"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences, images, projects } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { deleteStoredImage } from "@/lib/image/storage";

export async function deleteArticleAction(projectId: string): Promise<void> {
  // Shared workspace: every signed-in account sees and manages all content,
  // so there is no per-creator ownership restriction.
  await requireUser();
  if (!projectId) throw new Error("Article not found.");
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return;

  const [generated, references] = await Promise.all([
    db.select({ storagePath: images.storagePath }).from(images).where(eq(images.projectId, projectId)),
    db.select({ storagePath: imageReferences.storagePath }).from(imageReferences).where(eq(imageReferences.projectId, projectId)),
  ]);
  const paths = Array.from(new Set([...generated, ...references].map((item) => item.storagePath)));
  const cleanup = await Promise.allSettled(paths.map((storagePath) => deleteStoredImage(storagePath)));
  const failed = cleanup.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw new Error("The article was not deleted because one of its stored images could not be removed.");

  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/library");
  revalidatePath("/");
}

/**
 * Several at once, from the table's selection.
 *
 * Sequential, not `Promise.all`. Each delete removes stored image files before
 * dropping the row and REFUSES the whole article if any file cannot be removed
 * — running twenty of those concurrently would fan out into the image store all
 * at once and make a partial failure much harder to read. One at a time, the
 * first failure stops the run and everything after it is left untouched, which
 * is the state the message describes.
 */
export async function deleteArticlesAction(projectIds: string[]): Promise<void> {
  await requireUser();
  for (const projectId of projectIds) {
    await deleteArticleAction(projectId);
  }
}
