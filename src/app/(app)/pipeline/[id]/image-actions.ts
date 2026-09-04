"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences, images, projects } from "@/db/schema";
import type { ReferenceOrigin } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { getImageProvider } from "@/lib/image/registry";
import { deleteStoredImage, loadStoredImage, saveImage } from "@/lib/image/storage";
import { imageSize } from "@/lib/image/dimensions";
import { findReferenceCandidates } from "@/lib/image/reference-sources";
import { MAX_FOUND_REFERENCES } from "@/lib/image/reference-policy";
import { DEFAULT_IMAGE_MODE, IMAGE_MODES, type ImageMode } from "@/lib/image/visual-brief";
import { extractOutlineSources } from "@/lib/outline";
import type { ImageAspectRatio, ReferenceImageInput } from "@/lib/image/providers";
import { IMAGE_ASPECT_RATIOS } from "@/lib/image/providers";

export type GeneratedImageView = {
  id: string;
  url: string;
  provider: string;
  model: string;
  aspectRatio: string;
  variationNo: number;
};

/**
 * What one generation run produced, including what it failed to produce.
 *
 * The action used to return only the successes. Variations run as independent
 * calls, so asking for four and receiving one was a normal outcome — and the
 * editor was shown one image with nothing to say the other three had been
 * attempted and refused. A partial failure is information, not noise.
 */
export type GenerationRunResult = {
  images: GeneratedImageView[];
  /** Variations that were requested but produced nothing. */
  failedCount: number;
  /** The first failure's message, so the editor can act on it. */
  failureReason?: string;
};

export type UploadedReferenceView = {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  origin: ReferenceOrigin;
  /** The page it came from, for a reference that was found rather than chosen. */
  sourceUrl: string | null;
  sourceName: string | null;
  /** Null means nobody has cleared this image — shown, not hidden. */
  license: string | null;
};

const referenceView = (row: typeof imageReferences.$inferSelect): UploadedReferenceView => ({
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

const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;
const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
async function loadSharp() {
  return (await import("sharp")).default;
}

export async function uploadImageReferenceAction(
  projectId: string,
  formData: FormData
): Promise<UploadedReferenceView> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (file.size > MAX_REFERENCE_BYTES) throw new Error("Reference images must be 2 MB or smaller.");
  if (!REFERENCE_MIME_TYPES.has(file.type)) throw new Error("Use a PNG, JPEG, or WebP image.");

  const db = await getDb();
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found.");

  const source = Buffer.from(await file.arrayBuffer());
  const metadata = imageSize(source);
  if (!metadata) throw new Error("The uploaded image could not be read.");

  // Normalizing to PNG gives providers a predictable, metadata-free input and
  // applies the EXIF rotation a phone photo carries. It is the one thing here
  // that genuinely needs sharp, so if sharp cannot load, keep the upload rather
  // than failing it and send the original bytes: a reference image that is
  // sideways is a smaller problem than one that never uploads at all.
  let data = source;
  let mimeType = file.type;
  let ext: "png" | "jpg" = file.type === "image/png" ? "png" : "jpg";
  try {
    const sharp = await loadSharp();
    data = await sharp(source).rotate().png().toBuffer();
    mimeType = "image/png";
    ext = "png";
  } catch {
    // sharp is unavailable on this runtime; the original bytes are still valid.
  }
  const { storagePath } = await saveImage({ data, mimeType, ext });
  const [row] = await db
    .insert(imageReferences)
    .values({
      projectId,
      storagePath,
      mimeType: "image/png",
      originalName: file.name.slice(0, 180) || "reference.png",
      width: metadata.width,
      height: metadata.height,
      origin: "upload",
    })
    .returning();

  return referenceView(row);
}

/**
 * Find reference images for this article, from the sources it already cites
 * and from an open-licence pool.
 *
 * Nothing is generated here and nothing is published. This attaches material
 * to the project that the editor can look at, remove, and then generate from —
 * which is the point: a cover drawn from words alone reads as generic because
 * the model was never shown a real surface, a real specimen, or the actual
 * thing the article is about.
 *
 * The article's own sources lead, because they are the material genuinely
 * related to the piece. An image taken from one of them carries NO licence,
 * and the row says so rather than implying otherwise — `license` stays null,
 * `sourceUrl` records the page, and the stage shows both. That is a decision
 * put in front of the editor, not one made for them.
 *
 * Pressing this twice does not collect the same pages twice: whatever the
 * project already holds is excluded before fetching.
 */
export async function findReferenceImagesAction(
  projectId: string,
  options?: {
    query?: string;
    useArticleSources?: boolean;
    useOpenLicense?: boolean;
    /** Grounded searches the stock libraries first; see findReferenceCandidates. */
    mode?: ImageMode;
  }
): Promise<{ references: UploadedReferenceView[]; searched: number; note?: string }> {
  await requireUser();
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found.");

  const mode: ImageMode = IMAGE_MODES.some((option) => option.value === options?.mode)
    ? (options!.mode as ImageMode)
    : DEFAULT_IMAGE_MODE;
  const useArticleSources = options?.useArticleSources !== false;
  const useOpenLicense = options?.useOpenLicense !== false;
  if (!useArticleSources && !useOpenLicense) {
    throw new Error("Choose at least one place to look for references.");
  }

  const db = await getDb();
  const existing = await db
    .select()
    .from(imageReferences)
    .where(eq(imageReferences.projectId, projectId));
  const room = MAX_FOUND_REFERENCES - existing.length;
  if (room <= 0) {
    return {
      references: existing.map(referenceView),
      searched: 0,
      note: `This article already has ${existing.length} references. Remove one to look for more.`,
    };
  }

  // The outline is where research sources live; its only links are those
  // sources. The finished article repeats them under its own Sources heading,
  // so it is a serviceable fallback for a project whose outline predates them.
  const outlineMarkdown = loaded.project.outline?.markdown ?? "";
  const selected = loaded.drafts.find((draft) => draft.isSelected) ?? loaded.drafts[0];
  const sources = [
    ...extractOutlineSources(outlineMarkdown),
    ...extractOutlineSources(selected?.contentMd ?? ""),
  ];
  const alreadyTaken = new Set(existing.map((row) => row.sourceUrl).filter(Boolean) as string[]);
  const unseen = sources.filter((source) => !alreadyTaken.has(source.url));

  const query =
    (typeof options?.query === "string" ? options.query.trim().slice(0, 120) : "") ||
    loaded.project.selectedTopic?.title ||
    "";

  if (unseen.length === 0 && (!useOpenLicense || !query)) {
    return {
      references: existing.map(referenceView),
      searched: 0,
      note: "This article has no cited sources left to take an image from.",
    };
  }

  const candidates = await findReferenceCandidates({
    sources: unseen,
    query,
    limit: room,
    useArticleSources,
    useOpenLicense,
    stockFirst: mode === "grounded",
  });

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

  revalidatePath(`/pipeline/${projectId}`);
  return {
    references: [...existing.map(referenceView), ...saved],
    searched: unseen.length,
    note:
      saved.length === 0
        ? mode === "grounded" && !process.env.UNSPLASH_ACCESS_KEY
          ? "No photographs were found. UNSPLASH_ACCESS_KEY is not set, so only the article's own sources and Openverse were searched — neither reliably has a photograph of a working scene."
          : unseen.length > 0
            ? "No usable photograph came back — the stock search found nothing for this scene, and none of the cited sources published a usable lead image."
            : "The stock search found nothing for this scene. Try Auto-draft first, so the search uses the scene the brief describes."
        : undefined,
  };
}

/** Detach a reference from the article and delete its bytes. */
export async function deleteImageReferenceAction(referenceId: string): Promise<void> {
  await requireUser();
  const db = await getDb();
  const [row] = await db
    .select({ id: imageReferences.id, projectId: imageReferences.projectId, storagePath: imageReferences.storagePath })
    .from(imageReferences)
    .where(eq(imageReferences.id, referenceId))
    .limit(1);
  if (!row) return;

  await deleteStoredImage(row.storagePath);
  await db.delete(imageReferences).where(eq(imageReferences.id, referenceId));
  revalidatePath(`/pipeline/${row.projectId}`);
}

export async function generateImagesAction(
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
  await requireUser();
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

  revalidatePath(`/pipeline/${projectId}`);
  return { images: out, failedCount, failureReason };
}


/**
 * Choose which generated image becomes the article's cover.
 *
 * Only one image travels to the Hub, and the stage used to send whichever was
 * generated most recently — so a third variation silently replaced a first the
 * editor preferred. Stored on the project rather than as a flag per image, so
 * there is exactly one place the answer can live and no way to end up with two.
 */
export async function setCoverImageAction(projectId: string, imageId: string): Promise<void> {
  await requireUser();
  const db = await getDb();
  const loaded = await loadProject(projectId);
  if (!loaded) throw new Error("Project not found");
  await db
    .update(projects)
    .set({
      inputs: { ...loaded.project.inputs, coverImageId: imageId },
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  revalidatePath(`/pipeline/${projectId}`);
}

export async function deleteGeneratedImageAction(imageId: string): Promise<void> {
  // Shared workspace: every signed-in account manages all generated images.
  await requireUser();
  const db = await getDb();
  const [row] = await db
    .select({ id: images.id, projectId: images.projectId, storagePath: images.storagePath })
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);
  if (!row) return;

  await deleteStoredImage(row.storagePath);
  await db.delete(images).where(eq(images.id, imageId));
  revalidatePath(`/pipeline/${row.projectId}`);
}
