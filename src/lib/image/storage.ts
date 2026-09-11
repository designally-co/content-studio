import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { GeneratedImage } from "./providers";
import { loadSharp } from "./sharp";
import {
  R2_VARS,
  currentPublicUrl,
  deleteR2Object,
  getR2Object,
  isR2Url,
  putR2Object,
  r2Config,
  r2KeyFromUrl,
} from "./r2";

/**
 * Where images are kept, and how to get them back.
 *
 * A row's `storage_path` names the store its file is in, by its shape:
 *
 *   https://…               Cloudflare R2 — every image written now, stored as
 *                           its full public URL.
 *   supabase:<bucket>/<f>   Supabase Storage — rows written before the move to
 *                           R2. READ-ONLY: nothing uploads there any more, and
 *                           nothing deletes from it.
 *   local:<f>               ./data/images — local development and self-hosting.
 */
export type StoredRef = { storagePath: string };

/** What was actually written, for the caller that has to record it. */
export type StoredImage = StoredRef & {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

const LOCAL_DIR = path.join(process.cwd(), "data", "images");

/** Supabase credentials, used only to READ rows written before the move to R2. */
function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function supabaseAuthHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
  };
  // Legacy service-role keys are JWTs and are accepted as Bearer tokens. New
  // sb_secret_* keys are API keys, not JWTs, and must only use `apikey`.
  if (!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_")) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

/**
 * The longest edge a stored cover needs to be.
 *
 * The Hub's widest content column is well under this, and it derives its own
 * responsive sizes from whatever it receives — so anything above 1600 is
 * carried, paid for and thrown away. Generated originals arrive at 2048 and up.
 */
const DELIVERY_MAX_WIDTH = 1600;

/** WebP quality. 80 is the knee: visually indistinguishable, a fraction of PNG. */
const DELIVERY_QUALITY = 80;

/**
 * Store a generated image as a resized WebP — never the original.
 *
 * WHY THIS EXISTS RATHER THAN JUST CALLING `saveImage`. A generated PNG at
 * native size runs to several megabytes, and every one of them is paid for
 * three times over: once into storage, once out of it when the Hub fetches the
 * cover, and once again by every reader the Hub serves it to. Nothing in the
 * chain wants the original — the Hub re-encodes to its own responsive sizes
 * from whatever it is given.
 *
 * It returns the bytes it actually wrote along with their dimensions, because
 * the caller records width and height on the row. Measuring the input would
 * file the ORIGINAL's dimensions against a file that is no longer that size —
 * and dimensions drive the cover's aspect ratio on the Hub, so the error would
 * surface as a cropped or letterboxed cover rather than as a wrong number.
 *
 * Deliberately NOT applied to reference photographs, which take the same
 * `saveImage` path: those are material handed BACK to an image provider, and
 * they are normalised to PNG on purpose so every provider gets one predictable,
 * metadata-free format.
 *
 * sharp is required here. There is no degrade-to-the-original branch, because
 * uploading the original is the thing this function exists to prevent — if the
 * binary cannot load, the failure should be loud and at the point of cause.
 */
export async function saveGeneratedImage(img: GeneratedImage): Promise<StoredImage> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(img.data)
    // `withoutEnlargement` so a provider that returns something small is stored
    // as it came, rather than upscaled into a bigger file that shows less.
    .rotate()
    .resize({ width: DELIVERY_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: DELIVERY_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const ref = await saveImage({ data, mimeType: "image/webp", ext: "webp" });
  return { ...ref, data, mimeType: "image/webp", width: info.width, height: info.height };
}

export async function saveImage(img: GeneratedImage): Promise<StoredRef> {
  // The naming it has always had: a random UUID and the extension, at the
  // bucket's root.
  const filename = `${randomUUID()}.${img.ext}`;

  if (r2Config()) {
    return { storagePath: await putR2Object({ key: filename, body: img.data, contentType: img.mimeType }) };
  }

  /* NO R2 ON VERCEL IS AN ERROR, NOT A FALLBACK. The filesystem there lasts
     one invocation: an image written to it is gone before publishing looks for
     it, and the article reaches the Hub with no cover and no error. That
     happened once, for ten days, because this function used to fall back
     silently. Local disk stays the right answer everywhere that has one. */
  if (process.env.VERCEL) {
    throw new Error(
      `Image storage is not configured on this deployment, so the image was not saved. Set ${R2_VARS.join(", ")} and redeploy.`,
    );
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, filename), img.data);
  return { storagePath: `local:${filename}` };
}

/** Resolve a stored path back into bytes. */
export async function resolveImage(
  storagePath: string
): Promise<{ kind: "bytes"; data: Buffer; mimeType: string } | null> {
  if (isR2Url(storagePath)) {
    const object = await getR2Object(r2KeyFromUrl(storagePath));
    return object ? { kind: "bytes", ...object } : null;
  }

  if (storagePath.startsWith("local:")) {
    const filename = storagePath.slice("local:".length);
    // guard against traversal
    const safe = path.basename(filename);
    const full = path.join(LOCAL_DIR, safe);
    try {
      const data = await fs.readFile(full);
      const mimeType = safe.endsWith(".webp")
        ? "image/webp"
        : safe.endsWith(".jpg")
          ? "image/jpeg"
          : "image/png";
      return { kind: "bytes", data, mimeType };
    } catch {
      return null;
    }
  }

  if (storagePath.startsWith("supabase:")) {
    const sb = supabase();
    if (!sb) return null;
    const rel = storagePath.slice("supabase:".length); // bucket/filename
    const response = await fetch(`${sb.url}/storage/v1/object/${rel}`, {
      headers: supabaseAuthHeaders(sb.key),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    return {
      kind: "bytes",
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "image/png",
    };
  }
  return null;
}

/**
 * URLs a browser or the Hub can fetch an image from directly, without going
 * through this app — so a grid of N images is not N serverless invocations,
 * each opening a database connection to look up a path, and a cover handed to
 * the Hub is a few hundred bytes rather than the file.
 *
 * R2 rows are public, so their URL is simply rebuilt against the current
 * domain. Supabase-era rows are private and get signed URLs, one request per
 * bucket. `local:` paths, and anything that fails to sign, are left out;
 * callers fall back to /api/images/[id] for those.
 */
export async function fetchableImageUrls(
  storagePaths: string[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // bucket -> (objectName -> original storagePath)
  const byBucket = new Map<string, Map<string, string>>();
  for (const storagePath of new Set(storagePaths)) {
    if (!storagePath) continue;
    if (isR2Url(storagePath)) {
      out.set(storagePath, currentPublicUrl(storagePath));
      continue;
    }
    if (!storagePath.startsWith("supabase:")) continue;
    const relative = storagePath.slice("supabase:".length);
    const separator = relative.indexOf("/");
    if (separator <= 0) continue;
    const bucket = relative.slice(0, separator);
    const objectName = relative.slice(separator + 1);
    if (!objectName) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Map());
    byBucket.get(bucket)!.set(objectName, storagePath);
  }

  const sb = supabase();
  if (!sb) return out;

  await Promise.all(
    [...byBucket].map(async ([bucket, objects]) => {
      try {
        const response = await fetch(`${sb.url}/storage/v1/object/sign/${bucket}`, {
          method: "POST",
          headers: { ...supabaseAuthHeaders(sb.key), "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: expiresInSeconds, paths: [...objects.keys()] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) return;
        const rows = (await response.json()) as {
          path?: string;
          signedURL?: string;
        }[];
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
          if (!row?.signedURL || !row.path) continue;
          const storagePath = objects.get(row.path);
          if (storagePath) out.set(storagePath, `${sb.url}/storage/v1${row.signedURL}`);
        }
      } catch {
        // Signing is an optimisation — fall back to the API route silently.
      }
    })
  );

  return out;
}

/** Resolve any stored image to bytes for sending to an upstream model. */
export async function loadStoredImage(storagePath: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const resolved = await resolveImage(storagePath);
  if (!resolved) return null;
  return { data: resolved.data, mimeType: resolved.mimeType };
}

/**
 * Remove a generated or uploaded image from its store. Resolves to whether the
 * file is actually gone, because one kind of file is deliberately never
 * removed and a caller that records deletions has to be able to tell.
 */
export async function deleteStoredImage(storagePath: string): Promise<boolean> {
  if (isR2Url(storagePath)) {
    await deleteR2Object(r2KeyFromUrl(storagePath));
    return true;
  }

  if (storagePath.startsWith("local:")) {
    const filename = path.basename(storagePath.slice("local:".length));
    if (!filename) return true;
    await fs.unlink(path.join(LOCAL_DIR, filename)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return true;
  }

  /* SUPABASE FILES ARE LEFT WHERE THEY ARE, ON PURPOSE. Decided when images
     moved to R2 (September 2026): the rows written before the move still read
     from Supabase, what it costs is egress rather than the space these occupy,
     and deleting from the old store is not this app's job any more. The row
     can still go — deleting an article is not refused over it — and the file
     stays behind as an orphan. */
  return false;
}
