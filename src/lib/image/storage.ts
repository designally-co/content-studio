import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { GeneratedImage } from "./providers";

/**
 * Persist a generated image. Uses Supabase Storage when configured, otherwise
 * the local filesystem (self-host friendly). Returns a storage path that the
 * /api/images/[id] route resolves back to bytes.
 */
export type StoredRef = { storagePath: string };

const LOCAL_DIR = path.join(process.cwd(), "data", "images");

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "content-studio-images";
  if (!url || !key) return null;
  return { url, key, bucket };
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

function supabaseUploadHeaders(key: string, mimeType: string): HeadersInit {
  return {
    ...supabaseAuthHeaders(key),
    "content-type": mimeType,
    "x-upsert": "true",
  };
}

export async function saveImage(img: GeneratedImage): Promise<StoredRef> {
  const sb = supabase();
  const filename = `${randomUUID()}.${img.ext}`;

  if (sb) {
    const res = await fetch(
      `${sb.url}/storage/v1/object/${sb.bucket}/${filename}`,
      {
        method: "POST",
        headers: supabaseUploadHeaders(sb.key, img.mimeType),
        body: new Uint8Array(img.data),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Supabase storage upload failed (${res.status}): ${detail.slice(0, 200)}`
      );
    }
    return { storagePath: `supabase:${sb.bucket}/${filename}` };
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, filename), img.data);
  return { storagePath: `local:${filename}` };
}

/** Resolve a stored path back into bytes. */
export async function resolveImage(
  storagePath: string
): Promise<{ kind: "bytes"; data: Buffer; mimeType: string } | null> {
  if (storagePath.startsWith("local:")) {
    const filename = storagePath.slice("local:".length);
    // guard against traversal
    const safe = path.basename(filename);
    const full = path.join(LOCAL_DIR, safe);
    try {
      const data = await fs.readFile(full);
      const mimeType = safe.endsWith(".jpg") ? "image/jpeg" : "image/png";
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

/** Resolve any stored image to bytes for sending to an upstream model. */
export async function loadStoredImage(storagePath: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const resolved = await resolveImage(storagePath);
  if (!resolved) return null;
  return { data: resolved.data, mimeType: resolved.mimeType };
}

/** Remove a generated or uploaded image from its configured backing store. */
export async function deleteStoredImage(storagePath: string): Promise<void> {
  if (storagePath.startsWith("local:")) {
    const filename = path.basename(storagePath.slice("local:".length));
    if (!filename) return;
    await fs.unlink(path.join(LOCAL_DIR, filename)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }

  if (storagePath.startsWith("supabase:")) {
    const sb = supabase();
    if (!sb) throw new Error("Supabase storage is not configured.");
    const relative = storagePath.slice("supabase:".length);
    const separator = relative.indexOf("/");
    const bucket = separator > 0 ? relative.slice(0, separator) : "";
    const objectName = separator > 0 ? relative.slice(separator + 1) : "";
    if (!bucket || !objectName) throw new Error("Invalid Supabase storage path.");
    const response = await fetch(`${sb.url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: {
        ...supabaseAuthHeaders(sb.key),
        "content-type": "application/json",
      },
      body: JSON.stringify({ prefixes: [objectName] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Supabase storage deletion failed (${response.status}): ${detail.slice(0, 200)}`);
    }
  }
}
