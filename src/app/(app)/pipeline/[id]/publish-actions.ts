"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { publishMetadata } from "@/lib/publish-meta";
import { getModels, runText } from "@/lib/anthropic";
import { isHubConfigured, publishArticleToHub, uploadImageToHub } from "@/lib/hub";
import { resolveImage } from "@/lib/image/storage";
import { stripTitleHeading } from "@/lib/markdown";

export type PublishToHubResult = { url: string; slug: string; status: string };

/**
 * Publish the finalized article to the Designally Knowledge Hub as a DRAFT.
 * Derives tags from the content direction, auto-generates a one-sentence dek,
 * posts the Markdown body, and records the Hub URL on the project.
 */
export async function publishToHubAction(projectId: string): Promise<PublishToHubResult> {
  await requireUser();

  if (!isHubConfigured()) {
    throw new Error(
      "Knowledge Hub isn't configured. Set HUB_BASE_URL and HUB_API_KEY in the environment.",
    );
  }

  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found.");

  const title = loaded.project.selectedTopic?.title?.trim();
  const draftMarkdown = (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.contentMd?.trim();
  const { tags } = publishMetadata(loaded.category?.name);

  if (!title) throw new Error("This article has no title yet.");
  if (!draftMarkdown) throw new Error("There's no article draft to publish.");
  if (tags.length === 0) {
    throw new Error("Set a content direction first — the Hub needs at least one tag.");
  }

  // The generator writes the title as a leading H1; the Hub renders the title
  // separately, so strip it to avoid the title showing twice.
  const bodyMarkdown = stripTitleHeading(draftMarkdown, title);

  // Auto-generate a one-sentence dek. Optional: never block publishing on it.
  let summary: string | undefined;
  try {
    const { drafting } = await getModels();
    const { text } = await runText({
      model: drafting,
      task:
        "Write a single-sentence dek (subtitle) for this article: under 25 words, plain, " +
        "no surrounding quotes, framing what the reader gains. Return ONLY the sentence.\n\n" +
        `Title: ${title}\n\n${bodyMarkdown.slice(0, 4000)}`,
      maxTokens: 120,
      projectId,
      stage: "publish-dek",
    });
    summary = text.trim().replace(/^["']+|["']+$/g, "") || undefined;
  } catch {
    summary = undefined;
  }

  // Upload the first generated image into the Hub's media library as the cover.
  // Optional: a failed/absent image never blocks publishing.
  let coverImage: number | undefined;
  const firstImage = loaded.images[0];
  if (firstImage?.storagePath) {
    try {
      const resolved = await resolveImage(firstImage.storagePath);
      if (resolved) {
        const ext = resolved.mimeType.includes("png")
          ? "png"
          : resolved.mimeType.includes("webp")
            ? "webp"
            : "jpg";
        coverImage = await uploadImageToHub({
          data: resolved.data,
          filename: `${projectId}-cover.${ext}`,
          mimeType: resolved.mimeType,
          alt: title,
        });
      }
    } catch {
      coverImage = undefined;
    }
  }

  const result = await publishArticleToHub({
    title,
    tags,
    summary,
    bodyMarkdown,
    status: "draft",
    coverImage,
  });

  // Record where it went, merging with any existing published targets.
  const db = await getDb();
  const existing = (loaded.project.publishedTo ?? {}) as Record<string, string>;
  await db
    .update(projects)
    .set({
      publishedTo: { ...existing, knowledgeHub: result.absoluteUrl },
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath(`/pipeline/${projectId}`);
  return { url: result.absoluteUrl, slug: result.slug, status: result.status };
}
