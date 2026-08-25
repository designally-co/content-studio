"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences, images, projects } from "@/db/schema";
import type { LogoOverlay } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { getImageProvider } from "@/lib/image/registry";
import { deleteStoredImage, loadStoredImage, saveImage } from "@/lib/image/storage";
import { imageSize } from "@/lib/image/dimensions";
import type { ImageAspectRatio, ReferenceImageInput } from "@/lib/image/providers";
import { IMAGE_ASPECT_RATIOS } from "@/lib/image/providers";

export type GeneratedImageView = {
  id: string;
  url: string;
  provider: string;
  model: string;
  aspectRatio: string;
  variationNo: number;
  /** per-image logo overlay settings; null = no branding */
  branding: LogoOverlay | null;
};

export type UploadedReferenceView = {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
};

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
    })
    .returning();

  return {
    id: row.id,
    url: `/api/image-references/${row.id}`,
    name: row.originalName,
    width: row.width,
    height: row.height,
  };
}

export async function generateImagesAction(
  projectId: string,
  request: {
    prompt: string;
    optionId: string;
    aspectRatio: ImageAspectRatio;
    variationCount: number;
    referenceIds: string[];
  }
): Promise<GeneratedImageView[]> {
  await requireUser();
  if (!request || typeof request !== "object") throw new Error("Invalid generation request.");
  const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";
  if (!prompt) throw new Error("Enter an image prompt.");
  if (prompt.length > 8000) throw new Error("Image prompts must be 8,000 characters or shorter.");
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

  const generations = await Promise.allSettled(
    Array.from({ length: variationCount }, () =>
      provider.generate(
        { prompt, aspectRatio: request.aspectRatio, referenceImages: references },
        keyId || undefined
      )
    )
  );
  const generated = generations.flatMap((result, index) =>
    result.status === "fulfilled"
      ? result.value.images.map((image) => ({ image, variationNo: index + 1 }))
      : []
  );
  if (generated.length === 0) {
    const failed = generations.find((result) => result.status === "rejected");
    throw failed && failed.status === "rejected"
      ? failed.reason
      : new Error("No images were returned.");
  }

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

  /* New images carry NO logo.
   *
   * They used to be branded automatically wherever a brand logo existed, which
   * put the publisher's mark on every article image. These articles are not
   * about Designally — the image belongs to its subject, and a mark in the
   * corner makes an editorial photograph read as a promotional one, which is
   * the distinction the visual direction turns on.
   *
   * The per-image control is untouched, so a logo can still be added
   * deliberately where one is wanted. It is opt-in now rather than opt-out. */
  const defaultBranding: LogoOverlay | null = null;
  const out: GeneratedImageView[] = [];

  for (const { image: img, variationNo } of generated) {
    const { storagePath } = await saveImage(img);
    const metadata = imageSize(img.data) ?? { width: null, height: null };
    const [row] = await db
      .insert(images)
      .values({
        projectId,
        provider: provider.provider,
        model: provider.model,
        prompt,
        aspectRatio: request.aspectRatio,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        variationNo,
        referenceIds,
        storagePath,
        branding: defaultBranding,
      })
      .returning();
    out.push({
      id: row.id,
      url: `/api/images/${row.id}`,
      provider: provider.provider,
      model: provider.model,
      aspectRatio: request.aspectRatio,
      variationNo,
      branding: row.branding,
    });
  }

  revalidatePath(`/pipeline/${projectId}`);
  return out;
}

/** Save (or clear) the brand-logo overlay settings for one generated image. */
export async function setImageBrandingAction(
  imageId: string,
  branding: LogoOverlay | null
): Promise<void> {
  await requireUser();
  const db = await getDb();
  await db.update(images).set({ branding }).where(eq(images.id, imageId));
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
