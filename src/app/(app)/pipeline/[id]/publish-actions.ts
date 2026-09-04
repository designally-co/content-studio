"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { coverImage, loadProject } from "@/lib/projects";
import { publishMetadata } from "@/lib/publish-meta";
import { getModels, runText } from "@/lib/anthropic";
import {
  isHubConfigured,
  publishArticleToHub,
  uploadImageToHub,
  uploadImageToHubByUrl,
} from "@/lib/hub";
import { createSignedImageUrls, resolveImage } from "@/lib/image/storage";
import { stripTitleHeading } from "@/lib/markdown";
import { splitSourcesSection } from "@/lib/outline";

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
export type PublishToHubOutcome =
  ({ ok: true } & PublishToHubResult) | { ok: false; message: string };

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
export async function ensurePublishDekAction(
  projectId: string,
): Promise<string | undefined> {
  await requireUser();

  const loaded = await loadProject(projectId);
  if (!loaded) return undefined;

  const cached = loaded.project.inputs.publishDek?.trim();
  if (cached) return cached;

  const title = loaded.project.selectedTopic?.title?.trim();
  const draftMarkdown = (
    loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0]
  )?.contentMd?.trim();
  if (!title || !draftMarkdown) return undefined;

  const dek = await generateDek(
    projectId,
    title,
    stripTitleHeading(draftMarkdown, title),
  );
  if (!dek) return undefined;

  const db = await getDb();
  await db
    .update(projects)
    .set({
      inputs: { ...loaded.project.inputs, publishDek: dek },
      updatedAt: new Date(),
    })
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
/**
 * Returns its failure instead of throwing it.
 *
 * `publishArticleToHub` throws with the Hub's own message — "slug must be
 * unique", "Create failed", whatever actually went wrong — and a thrown Server
 * Action error is redacted in production, so all of that arrived as "An
 * unexpected response was received from the server". A returned string is data
 * and reaches the screen intact.
 */
export async function publishToHubAction(
  projectId: string,
  status: "draft" | "published" = "draft",
): Promise<PublishToHubOutcome> {
  try {
    const r = await publishToHub(projectId, status);
    return { ok: true, ...r };
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Publishing to the Hub failed.",
    };
  }
}

async function publishToHub(
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
  const draftMarkdown = (
    loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0]
  )?.contentMd?.trim();
  const { tags } = publishMetadata(loaded.category?.name);

  if (!title) throw new Error("This article has no title yet.");
  if (!draftMarkdown) throw new Error("There's no article draft to publish.");
  if (tags.length === 0) {
    throw new Error(
      "Set a content direction first — the Hub needs at least one tag.",
    );
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
  let coverMediaId: number | undefined;
  let coverWarning: string | undefined;
  /* The one the editor chose — NOT `images[0]`, which is merely the newest.
     Picking the second variation and watching the Hub publish the third is
     what that mistake looked like from the outside. */
  const chosen = coverImage(loaded);

  if (!chosen?.storagePath) {
    coverWarning =
      "No generated image on this project, so it was published without a cover.";
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
        ? (await createSignedImageUrls([chosen.storagePath], 600)).get(
            chosen.storagePath,
          )
        : undefined;

      if (signed) {
        const ext = signed.includes(".png")
          ? "png"
          : signed.includes(".webp")
            ? "webp"
            : "jpg";
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
  const { body: bodyWithoutSources, references } =
    splitSourcesSection(bodyMarkdown);

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
      inputs: {
        ...loaded.project.inputs,
        publishDek: summary ?? loaded.project.inputs.publishDek,
      },
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
