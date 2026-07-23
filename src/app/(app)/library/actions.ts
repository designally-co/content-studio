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
