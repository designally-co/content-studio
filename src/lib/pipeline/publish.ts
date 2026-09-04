import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { coverImage, loadProject } from "@/lib/projects";
import {
  isHubConfigured,
  publishArticleToHub,
  uploadImageToHub,
  uploadImageToHubByUrl,
} from "@/lib/hub";
import { publishMetadata } from "@/lib/publish-meta";
import { createSignedImageUrls, resolveImage } from "@/lib/image/storage";
import { stripTitleHeading } from "@/lib/markdown";
import { splitSourcesSection } from "@/lib/outline";
import { getModels, runText } from "@/lib/anthropic";

export type PublishToHubResult = {
  url: string;
  slug: string;
  status: string;
  /**
   * Why the article went up without its cover, when it did.
   *
   * The cover is deliberately optional — a bad image must never stop an article
   * being published. But "optional" was implemented as an empty `catch`, so a
   * cover that failed for TEN DAYS looked exactly like a cover nobody asked
   * for: articles arriving at the Hub with no image and no complaint. The
   * decision to carry on is right; throwing the reason away was not.
   */
  coverWarning?: string;
};

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

  // Put the cover in the Hub's media library. Optional: a failed or absent
  // image never blocks publishing — it comes back as a warning instead.
  let coverMediaId: number | undefined;
  let coverWarning: string | undefined;
  /* The one the editor chose — NOT `images[0]`, which is merely the newest.
     Picking the second variation and watching the Hub publish the third is
     what that mistake looked like from the outside. The autopilot has no
     editor and no choice recorded, so it falls through to the same default. */
  const chosen = coverImage(loaded);

  if (!chosen?.storagePath) {
    coverWarning = "No generated image on this project, so it was published without a cover.";
  } else {
    try {
      /* THE BYTES DO NOT TRAVEL IF THEY DO NOT HAVE TO. Vercel refuses a
         request body over 4.5MB at the edge — a 413 before the Hub's route or
         auth runs, with no error body to report — and generated covers now
         exceed it, which is why ten days of articles published with no image.
         A signed URL is a few hundred bytes, and the Hub fetches the file
         itself, so size stops being a factor. `local:` paths have no URL to
         sign and fall through to the upload below, which is fine: that is the
         self-hosted case, where the 4.5MB ceiling does not exist either. */
      const signed = chosen.storagePath.startsWith("supabase:")
        ? (await createSignedImageUrls([chosen.storagePath], 600)).get(chosen.storagePath)
        : undefined;

      if (signed) {
        const ext = signed.includes(".png") ? "png" : signed.includes(".webp") ? "webp" : "jpg";
        coverMediaId = await uploadImageToHubByUrl({
          url: signed,
          filename: `${projectId}-cover.${ext}`,
          alt: title,
        });
      } else {
        const resolved = await resolveImage(chosen.storagePath);
        if (!resolved) {
          /* The single most useful thing this function can say. `resolveImage`
             returns null when the bytes cannot be fetched — and the storage
             BACKEND is the usual reason: with SUPABASE_SERVICE_ROLE_KEY unset,
             images are written to the local filesystem, which on Vercel is
             per-invocation. The image is generated in one request and gone by
             the time this one looks for it, silently, in production only. */
          const backend = chosen.storagePath.startsWith("supabase:")
            ? "Supabase Storage"
            : "the local filesystem";
          coverWarning =
            `The cover image could not be read from ${backend} ` +
            `(${chosen.storagePath.slice(0, 60)}), so the article was published without it.` +
            (chosen.storagePath.startsWith("local:")
              ? " Images are being stored on local disk, which does not persist on Vercel — set SUPABASE_SERVICE_ROLE_KEY."
              : "");
        } else {
          const ext = resolved.mimeType.includes("png")
            ? "png"
            : resolved.mimeType.includes("webp")
              ? "webp"
              : "jpg";
          coverMediaId = await uploadImageToHub({
            data: resolved.data,
            filename: `${projectId}-cover.${ext}`,
            mimeType: resolved.mimeType,
            alt: title,
          });
        }
      }
    } catch (cause) {
      /* Still never fatal — but now it says what happened. The Hub's own
         message comes through here when it is the one refusing. */
      coverWarning =
        `The cover image failed to upload to the Hub, so the article was published without it. ` +
        (cause instanceof Error ? cause.message : String(cause)).slice(0, 200);
      coverMediaId = undefined;
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
    coverImage: coverMediaId,
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
  return {
    url: result.absoluteUrl,
    slug: result.slug,
    status: result.status,
    ...(coverWarning ? { coverWarning } : {}),
  };
}
