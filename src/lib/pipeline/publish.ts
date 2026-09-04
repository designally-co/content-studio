import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { loadProject } from "@/lib/projects";
import { isHubConfigured, publishArticleToHub, uploadImageToHub } from "@/lib/hub";
import { publishMetadata } from "@/lib/publish-meta";
import { resolveImage } from "@/lib/image/storage";
import { stripTitleHeading } from "@/lib/markdown";
import { splitSourcesSection } from "@/lib/outline";
import { getModels, runText } from "@/lib/anthropic";

export type PublishToHubResult = { url: string; slug: string; status: string };

/**
 * Generate a one-sentence dek (subtitle) for an article. Best-effort — returns
 * undefined on any failure so it never blocks the caller.
 */
export async function generateDek(
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

/**
 * Publishing, with no session check.
 *
 * Out of the stage's `"use server"` module because every exported async
 * function in one is a callable endpoint, and this one posts to a live site.
 * The action imports it behind `requireUser()`; the autopilot runner imports it
 * behind its own shared-secret check.
 */

export async function publishToHubCore(
  projectId: string,
  status: "draft" | "published" = "draft",
): Promise<PublishToHubResult> {
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

  /* The Hub has a structured reference field and draws the list itself, so the
     article's own "## Sources" block is lifted out of the markdown and sent as
     data. Left in the body it would arrive as Lexical paragraphs — the same
     links, but unlistable and duplicated under a heading the Hub renders
     again. Inline links inside the prose are untouched. */
  const { body: bodyWithoutSources, references } = splitSourcesSection(bodyMarkdown);

  const result = await publishArticleToHub({
    title,
    tags,
    summary,
    bodyMarkdown: bodyWithoutSources,
    status,
    coverImage,
    ...(references.length ? { references } : {}),
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

  /*
   * NO revalidatePath HERE.
   *
   * It re-rendered both routes INSIDE this action's response, on top of a call
   * that has already published to the Hub and waited on a Thai translation. A
   * failure in that render corrupts the action's reply, and the caller sees
   * "An unexpected response was received from the server" — after the article
   * has in fact been published and saved. Exactly the symptom the draft step
   * had, one stage later: the work succeeds and the UI reports a failure.
   *
   * The try/catch around this function cannot help, because the render happens
   * after the body returns. So the caller refreshes instead, in its own
   * request with its own budget.
   */
  return { url: result.absoluteUrl, slug: result.slug, status: result.status };
}
