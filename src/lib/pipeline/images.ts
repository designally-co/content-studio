import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences, images, projects } from "@/db/schema";
import { loadProject } from "@/lib/projects";
import { getImageProvider } from "@/lib/image/registry";
import { loadStoredImage, saveImage } from "@/lib/image/storage";
import { imageSize } from "@/lib/image/dimensions";
import type { ImageAspectRatio, ReferenceImageInput } from "@/lib/image/providers";
import { IMAGE_ASPECT_RATIOS } from "@/lib/image/providers";
import { findReferenceCandidates } from "@/lib/image/reference-sources";
import { MAX_FOUND_REFERENCES } from "@/lib/image/reference-policy";
import type { ReferenceOrigin } from "@/db/schema";

/**
 * Finding reference photographs and generating images, with no session check.
 *
 * Out of the stage's `"use server"` module because every exported async
 * function in one is a callable endpoint, and these two spend money — a search
 * against Unsplash and a generation against Fal. The stage's actions import
 * them behind `requireUser()`; the autopilot runner imports them behind its own
 * shared-secret check.
 */

export type GeneratedImageView = {
  id: string;
  url: string;
  provider: string;
  model: string;
  aspectRatio: string;
  variationNo: number;
};

export type GenerationRunResult = {
  images: GeneratedImageView[];
  /** Variations that were requested but produced nothing. */
  failedCount: number;
  /** The first failure's message, so the caller can act on it. */
  failureReason?: string;
};

export type UploadedReferenceView = {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  origin: ReferenceOrigin;
  sourceUrl: string | null;
  sourceName: string | null;
  license: string | null;
};

export const referenceView = (row: typeof imageReferences.$inferSelect): UploadedReferenceView => ({
  id: row.id,
  url: `/api/image-references/${row.id}`,
  name: row.originalName,
  width: row.width,
  height: row.height,
  origin: row.origin,
  sourceUrl: row.sourceUrl,
  sourceName: row.sourceName,
  license: row.license,
});

/**
 * sharp, loaded only when an image is actually being handled.
 *
 * It used to be a top-level import, and that broke drafting in production.
 * Next bundles every "use server" module on a page into one server bundle, so
 * `POST /pipeline/[id]` — which is *any* action on this page, including the
 * research plan and the draft — loaded sharp before running a line of its own.
 * On Vercel's linux-x64 runtime sharp could not dlopen (`libvips-cpp.so`
 * missing) and the request 500'd with nothing to do with images in it.
 * Locally the darwin binaries are present, so it never failed here.
 *
 * Importing it inside the functions that need it keeps a native module off the
 * path of every other action on the page. Worth doing on its own merits: no
 * action should pay to load a binary it never calls.
 */
export async function loadSharp() {
  return (await import("sharp")).default;
}

/**
 * Find photographs of the scene this article's image should show.
 *
 * Nothing is generated here and nothing is published. This attaches material
 * the editor can look at, remove, and then generate from — which is the point:
 * a cover drawn from words alone reads as synthetic because the model was never
 * shown a real surface or a real moment.
 *
 * The query is the brief's `photoQuery` — the situation, in the words a
 * photographer would file it under. Searching the article's subject returned
 * pictures OF the topic; searching "designer working at desk laptop" returns a
 * photograph of somebody working, which is the thing the finished image is
 * matched against. So draft the prompt first; without a brief this falls back
 * to the topic title and finds much less.
 */
export async function findReferenceImagesCore(
  projectId: string,
  options?: { query?: string }
): Promise<{ references: UploadedReferenceView[]; note?: string }> {
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found.");

  const db = await getDb();
  const existing = await db
    .select()
    .from(imageReferences)
    .where(eq(imageReferences.projectId, projectId));
  const room = MAX_FOUND_REFERENCES - existing.length;
  if (room <= 0) {
    return {
      references: existing.map(referenceView),
      note: `This article already has ${existing.length} references. Remove one to look for more.`,
    };
  }

  const query =
    (typeof options?.query === "string" ? options.query.trim().slice(0, 120) : "") ||
    loaded.project.selectedTopic?.title ||
    "";
  if (!query) {
    return {
      references: existing.map(referenceView),
      note: "Draft the prompt first — the search needs the scene the brief describes.",
    };
  }

  const candidates = await findReferenceCandidates({ query, limit: room });

  const saved: UploadedReferenceView[] = [];
  for (const candidate of candidates) {
    // Normalised the same way an upload is, and for the same reason: the
    // providers get one predictable, metadata-free format. If sharp cannot
    // load, the original bytes are still a valid image.
    let data = candidate.data;
    let mimeType = candidate.mimeType;
    let ext = candidate.ext;
    try {
      const sharp = await loadSharp();
      data = await sharp(candidate.data).rotate().png().toBuffer();
      mimeType = "image/png";
      ext = "png";
    } catch {
      // sharp is unavailable on this runtime.
    }
    const { storagePath } = await saveImage({ data, mimeType, ext });
    const [row] = await db
      .insert(imageReferences)
      .values({
        projectId,
        storagePath,
        mimeType,
        originalName: candidate.originalName,
        width: candidate.width,
        height: candidate.height,
        origin: candidate.origin,
        sourceUrl: candidate.sourceUrl,
        sourceName: candidate.sourceName,
        license: candidate.license,
        attribution: candidate.attribution,
      })
      .returning();
    saved.push(referenceView(row));
  }

  return {
    references: [...existing.map(referenceView), ...saved],
    note:
      saved.length > 0
        ? undefined
        : process.env.UNSPLASH_ACCESS_KEY
          ? `No photographs came back for "${query}". Try a plainer scene in the prompt field, then draft again.`
          : "UNSPLASH_ACCESS_KEY is not set, so only Openverse was searched — it rarely has a photograph of somebody working.",
  };
}

export async function generateImagesCore(
  projectId: string,
  request: {
    prompt: string;
    optionId: string;
    aspectRatio: ImageAspectRatio;
    variationCount: number;
    referenceIds: string[];
    /**
     * One prompt per variation, each carrying a different concept, from
     * `generateImagePromptAction`. Variation `i` uses `variantPrompts[i]`, or
     * `prompt` where there is no entry for it — which is what happens when the
     * editor has written or edited the prompt themselves, and their words
     * should govern every image rather than be silently replaced.
     */
    variantPrompts?: string[];
  }
): Promise<GenerationRunResult> {
  if (!request || typeof request !== "object") throw new Error("Invalid generation request.");
  const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";
  if (!prompt) throw new Error("Enter an image prompt.");
  if (prompt.length > 8000) throw new Error("Image prompts must be 8,000 characters or shorter.");
  const variantPrompts = Array.isArray(request.variantPrompts)
    ? request.variantPrompts.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    : [];
  if (variantPrompts.some((entry) => entry.length > 8000)) {
    throw new Error("Image prompts must be 8,000 characters or shorter.");
  }
  if (typeof request.optionId !== "string" || request.optionId.length > 240) {
    throw new Error("Invalid image model selection.");
  }
  if (!IMAGE_ASPECT_RATIOS.includes(request.aspectRatio)) throw new Error("Invalid aspect ratio.");
  const [providerId, keyId] = request.optionId.split("::");
  const provider = getImageProvider(providerId);
  if (!provider) throw new Error("Unknown image provider.");
  if (!provider.capabilities.aspectRatios.includes(request.aspectRatio)) {
    throw new Error(`${provider.label} does not support the selected aspect ratio.`);
  }
  const requestedReferenceIds = Array.isArray(request.referenceIds)
    ? request.referenceIds.filter((id): id is string => typeof id === "string" && id.length <= 64)
    : [];
  const referenceIds = Array.from(new Set(requestedReferenceIds)).slice(0, provider.capabilities.maxReferenceImages);
  if (referenceIds.length > 0 && !provider.capabilities.referenceImages) {
    throw new Error(`${provider.label} does not support reference images.`);
  }
  if (provider.capabilities.referenceImagesRequired && referenceIds.length === 0) {
    throw new Error(`${provider.label} requires a reference image.`);
  }
  const requestedCount = Number.isFinite(request.variationCount) ? Math.floor(request.variationCount) : 1;
  const variationCount = Math.min(Math.max(requestedCount, 1), provider.capabilities.maxVariations);

  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found.");
  const references: ReferenceImageInput[] = [];
  for (const id of referenceIds) {
    const [row] = await db
      .select()
      .from(imageReferences)
      .where(eq(imageReferences.id, id))
      .limit(1);
    if (!row || row.projectId !== projectId) throw new Error("A reference image is unavailable.");
    const stored = await loadStoredImage(row.storagePath);
    if (!stored) throw new Error("A reference image could not be loaded.");
    references.push({ id: row.id, ...stored });
  }

  const promptFor = (index: number) => variantPrompts[index] || prompt;

  const generations = await Promise.allSettled(
    Array.from({ length: variationCount }, (_, index) =>
      provider.generate(
        { prompt: promptFor(index), aspectRatio: request.aspectRatio, referenceImages: references },
        keyId || undefined
      )
    )
  );
  const generated = generations.flatMap((result, index) =>
    result.status === "fulfilled"
      ? result.value.images.map((image) => ({ image, variationNo: index + 1, prompt: promptFor(index) }))
      : []
  );
  const rejection = generations.find((result) => result.status === "rejected");
  // Nothing at all is a failure and throws, as it always did. Some of what was
  // asked for is a result, and travels back with an account of the rest.
  if (generated.length === 0) {
    throw rejection && rejection.status === "rejected"
      ? rejection.reason
      : new Error("No images were returned.");
  }
  const failedCount = generations.filter((result) => result.status === "rejected").length;
  const failureReason =
    rejection && rejection.status === "rejected"
      ? rejection.reason instanceof Error
        ? rejection.reason.message
        : String(rejection.reason)
      : undefined;

  await db
    .update(projects)
    .set({
      inputs: {
        ...project.inputs,
        imageProvider: providerId,
        imageApiKeyId: keyId || undefined,
        imageCount: variationCount,
        imageAspectRatio: request.aspectRatio,
      },
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  const out: GeneratedImageView[] = [];

  for (const { image: img, variationNo, prompt: usedPrompt } of generated) {
    const { storagePath } = await saveImage(img);
    const metadata = imageSize(img.data) ?? { width: null, height: null };
    const [row] = await db
      .insert(images)
      .values({
        projectId,
        provider: provider.provider,
        model: provider.model,
        // The prompt this image came from, not the set's first one — the row is
        // the only record of why a given variation looks the way it does.
        prompt: usedPrompt,
        aspectRatio: request.aspectRatio,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        variationNo,
        referenceIds,
        storagePath,
      })
      .returning();
    out.push({
      id: row.id,
      url: `/api/images/${row.id}`,
      provider: provider.provider,
      model: provider.model,
      aspectRatio: request.aspectRatio,
      variationNo,
    });
  }

  return { images: out, failedCount, failureReason };
}
