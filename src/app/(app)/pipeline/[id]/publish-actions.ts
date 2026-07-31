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
 * Generate a one-sentence dek (subtitle) for an article. Best-effort — returns
 * undefined on any failure so it never blocks the caller.
 */
async function generateDek(
  projectId: string,
  title: string,
  bodyMarkdown: string,
): Promise<string | undefined> {
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
    return text.trim().replace(/^["']+|["']+$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Return the article's dek, generating and caching it on `inputs.publishDek` the
 * first time. Called when the Publish stage opens so the Hub preview shows the
 * real subtitle, and reused verbatim at publish time. Returns undefined when the
 * article can't be dek'd yet (no title/body) or generation fails.
 */
export async function ensurePublishDekAction(projectId: string): Promise<string | undefined> {
  await requireUser();

  const loaded = await loadProject(projectId);
  if (!loaded) return undefined;

  const cached = loaded.project.inputs.publishDek?.trim();
  if (cached) return cached;

  const title = loaded.project.selectedTopic?.title?.trim();
  const draftMarkdown = (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.contentMd?.trim();
  if (!title || !draftMarkdown) return undefined;

  const dek = await generateDek(projectId, title, stripTitleHeading(draftMarkdown, title));
  if (!dek) return undefined;

  const db = await getDb();
  await db
    .update(projects)
    .set({ inputs: { ...loaded.project.inputs, publishDek: dek }, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  return dek;
}

/**
 * Publish the finalized article to the Designally Knowledge Hub — live
 * (`published`) or as a `draft` to review in the Hub admin (where its Thai
 * translation can be checked before going live). Derives tags from the content
 * direction, auto-generates a one-sentence dek, posts the Markdown body, and
 * records the Hub URL on the project.
 */
export async function publishToHubAction(
  projectId: string,
  status: "draft" | "published" = "draft",
): Promise<PublishToHubResult> {
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

  // Reuse the dek cached when the Publish stage opened; generate on the fly only
  // if it's somehow missing. Optional — never block publishing on it.
  const summary =
    loaded.project.inputs.publishDek?.trim() ||
    (await generateDek(projectId, title, bodyMarkdown));

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
    status,
    coverImage,
  });

  // Record where it went, merging with any existing published targets. A live
  // publish flips the project to "published"; saving a Hub draft leaves it a
  // Draft (it isn't public yet). Cache the dek if we just generated it.
  const db = await getDb();
  const existing = (loaded.project.publishedTo ?? {}) as Record<string, string>;
  await db
    .update(projects)
    .set({
      publishedTo: { ...existing, knowledgeHub: result.absoluteUrl },
      ...(status === "published" ? { status: "published" as const } : {}),
      inputs: { ...loaded.project.inputs, publishDek: summary ?? loaded.project.inputs.publishDek },
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath(`/pipeline/${projectId}`);
  revalidatePath("/");
  return { url: result.absoluteUrl, slug: result.slug, status: result.status };
}
